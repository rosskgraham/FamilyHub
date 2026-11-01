import { CALENDAR_SOURCE, OCTOPUS_ACCOUNT, OCTOPUS_API_KEY, ZAPPI_GLO_API_KEY, ZAPPI_GLO_SN } from '$app/env/private';
import type { HalfHourUse, Live, OctopusStatus, Slot, UsageStatus } from '#lib/energy.ts';
import { addDays, dayKey, ukTime } from '#lib/time.ts';
import { orElse } from '../fallback.ts';
import { now } from '../now.ts';
import { readJson, writeJson } from '../store.ts';
import { createSync, type Kept, type Snapshot, type Sync } from '../sync.ts';
import { Myenergi, toHalfHours, utcDays } from './myenergi.ts';
import { merge, Octopus, UnsupportedTariff, type Tariff } from './octopus.ts';
import { sampleSlots, sampleTariff, sampleUsage } from './sample.ts';
import { openUsageStore, type UsageStore } from './usage-store.ts';

export interface EnergyResult {
	/** Null when Octopus has never answered, or the account isn't on Intelligent Octopus Go. */
	tariff: Tariff | null;
	/** Smart-charging slots from the start of yesterday on, past and planned. */
	slots: Slot[];
	status: OctopusStatus;
	/** Today's Half-hours so far, and all of yesterday's. */
	today: HalfHourUse[];
	yesterday: HalfHourUse[];
	/** Null when the Zappi hasn't reported for a while. */
	live: Live | null;
	usageStatus: UsageStatus;
	/** When each sync started failing, once it's been failing for an hour. */
	needsAlex: { octopus: string | null; zappi: string | null };
}

type Rates = Pick<EnergyResult, 'tariff' | 'slots' | 'status'> & { needsAlex: string | null };
type Usage = Pick<EnergyResult, 'today' | 'yesterday' | 'live' | 'usageStatus'> & { needsAlex: string | null };

/** Octopus's rates and slots, and the Zappi's usage. Each falls back on its own, so one failing leaves the other. */
export async function loadEnergy(): Promise<EnergyResult> {
	const at = now();
	const [rates, usage] = await Promise.all([
		orElse('Octopus', () => loadRates(at), noRates),
		orElse('Zappi', () => loadUsage(at), noUsage)
	]);
	return {
		tariff: rates.tariff,
		slots: rates.slots,
		status: rates.status,
		today: usage.today,
		yesterday: usage.yesterday,
		live: usage.live,
		usageStatus: usage.usageStatus,
		needsAlex: { octopus: rates.needsAlex, zappi: usage.needsAlex }
	};
}

const noRates: Rates = { tariff: null, slots: [], status: { kind: 'stale', updatedAt: null }, needsAlex: null };
const noUsage: Usage = { today: [], yesterday: [], live: null, usageStatus: { kind: 'stale', updatedAt: null }, needsAlex: null };

/** The earlier of two runs of failures that need Alex. */
function earlier(a: string | null, b: string | null): string | null {
	return a && b ? (a < b ? a : b) : (a ?? b);
}

/** A file in the data folder, read and written in the shape the sync keeps. */
function onDisk<T>(file: string) {
	return { load: () => readJson<Kept<T>>(file), save: (k: Kept<T>) => writeJson(file, k) };
}

// The rates are fixed for the tariff's term, so once a day is enough to notice a renewal.
const TARIFF_MS = 24 * 3600_000;
// Octopus reschedules slots through the day, but only while the car is plugged in; unplugged, hourly is enough.
const SLOTS_MS = 10 * 60_000;
const SLOTS_UNPLUGGED_MS = 60 * 60_000;

let octopus: { tariff: Sync<Tariff>; slots: Sync<Slot[]> } | undefined;

/** The background syncs for the tariff and slots, both kept on disk so past slots still cost yesterday after a restart. */
function octopusSyncs(account: string, apiKey: string) {
	if (octopus) return octopus;
	const client = new Octopus(account, apiKey);
	const tariff = createSync({
		name: 'Octopus tariff',
		fetch: () => client.tariff(),
		everyMs: TARIFF_MS,
		...onDisk<Tariff>('energy-tariff.json')
	});
	// Past slots Octopus no longer lists are kept, so a Half-hour is still costed at the Off-peak rate after its slot.
	let kept: Slot[] = [];
	const slotsFile = onDisk<Slot[]>('energy-slots.json');
	const slots = createSync({
		name: 'Octopus slots',
		fetch: async () => {
			const since = ukTime(addDays(dayKey(now()), -1), '00:00');
			kept = merge(kept, await client.slots(), now()).filter((s) => new Date(s.to) > since);
			return kept;
		},
		// Until the Zappi has said, assume the car might be plugged in.
		everyMs: () => (lastLive?.value?.car === 'unplugged' ? SLOTS_UNPLUGGED_MS : SLOTS_MS),
		load: async () => {
			const k = await slotsFile.load();
			kept = k?.value ?? [];
			return k;
		},
		save: slotsFile.save
	});
	octopus = { tariff, slots };
	return octopus;
}

/**
 * The tariff and Smart-charging slots from the Household's Octopus account once OCTOPUS_ACCOUNT and OCTOPUS_API_KEY are
 * set, otherwise sample ones. CALENDAR_SOURCE=sample forces samples too.
 */
async function loadRates(at: Date): Promise<Rates> {
	if (CALENDAR_SOURCE === 'sample' || !OCTOPUS_ACCOUNT || !OCTOPUS_API_KEY) {
		return { tariff: sampleTariff, slots: sampleSlots(at), status: { kind: 'sample' }, needsAlex: null };
	}
	const syncs = octopusSyncs(OCTOPUS_ACCOUNT, OCTOPUS_API_KEY);
	const [tariff, slots] = await Promise.all([syncs.tariff.read(), syncs.slots.read()]);
	const needsAlex = earlier(tariff.needsAlex, slots.needsAlex);
	if (tariff.error instanceof UnsupportedTariff) {
		return { tariff: null, slots: [], status: { kind: 'unsupported', tariff: tariff.error.tariff }, needsAlex };
	}
	const since = ukTime(addDays(dayKey(at), -1), '00:00');
	const recent = (slots.value ?? []).filter((s) => new Date(s.to) > since);
	// The older of the two, so the Hub never claims to be fresher than it is.
	const updatedAt = [tariff.at, slots.at].filter((t) => t !== null).sort()[0] ?? null;
	const status: OctopusStatus =
		tariff.error || slots.error || !updatedAt ? { kind: 'stale', updatedAt } : { kind: 'live', updatedAt };
	return { tariff: tariff.value, slots: recent, status, needsAlex };
}

// Live demand changes by the second, but once a minute is plenty for the wall.
const LIVE_MS = 60_000;
// After this long without hearing from the Zappi, Live demand isn't shown rather than shown out of date.
const LIVE_STALE_MS = 5 * 60_000;
const HISTORY_MS = 15 * 60_000;
// myenergi takes a little while to finish a day's history.
const SETTLED_MS = 60 * 60_000;
const DATABASE = 'data/energy.db';

let zappi: { live: Sync<Live>; history: Sync<true>; store: UsageStore } | undefined;
// The Zappi's last status, which also says how often to ask Octopus for slots.
let lastLive: Snapshot<Live> | null = null;

/** The background syncs for the Zappi's status and history, with the history added up into the usage store. */
function zappiSyncs(serial: string, apiKey: string) {
	if (zappi) return zappi;
	const client = new Myenergi(serial, apiKey);
	const store = openUsageStore(DATABASE);
	// UTC days whose whole history is already in the store.
	const settled = new Set<string>();
	const live = createSync({ name: 'Zappi status', fetch: () => client.live(), everyMs: LIVE_MS });
	const history = createSync({
		name: 'Zappi history',
		fetch: async () => {
			const since = ukTime(addDays(dayKey(now()), -1), '00:00');
			for (const day of utcDays(since, now()).filter((d) => !settled.has(d))) {
				store.save(toHalfHours(await client.minutes(day)));
				if (Date.now() > Date.parse(`${day}T00:00:00Z`) + 24 * 3600_000 + SETTLED_MS) settled.add(day);
			}
			return true as const;
		},
		everyMs: HISTORY_MS
	});
	zappi = { live, history, store };
	return zappi;
}

/**
 * House use, Car charging and Live demand from the Zappi once ZAPPI_GLO_SN and ZAPPI_GLO_API_KEY are set, otherwise
 * sample ones. CALENDAR_SOURCE=sample forces samples too.
 */
async function loadUsage(at: Date): Promise<Usage> {
	if (CALENDAR_SOURCE === 'sample' || !ZAPPI_GLO_SN || !ZAPPI_GLO_API_KEY) {
		return { ...sampleUsage(at), usageStatus: { kind: 'sample' }, needsAlex: null };
	}
	const syncs = zappiSyncs(ZAPPI_GLO_SN, ZAPPI_GLO_API_KEY);
	const [live, history] = await Promise.all([syncs.live.read(), syncs.history.read()]);
	lastLive = live;
	const midnight = ukTime(dayKey(at), '00:00');
	const since = ukTime(addDays(dayKey(at), -1), '00:00');
	const fresh = live.value !== null && live.at !== null && Date.now() - Date.parse(live.at) < LIVE_STALE_MS;
	return {
		today: syncs.store.between(midnight, at),
		yesterday: syncs.store.between(since, midnight),
		live: fresh ? live.value : null,
		usageStatus: fresh ? { kind: 'live', updatedAt: live.at! } : { kind: 'stale', updatedAt: live.at },
		needsAlex: earlier(live.needsAlex, history.needsAlex)
	};
}
