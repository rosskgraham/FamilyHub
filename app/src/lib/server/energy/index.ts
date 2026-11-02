import { CALENDAR_SOURCE, OCTOPUS_ACCOUNT, OCTOPUS_API_KEY, ZAPPI_GLO_API_KEY, ZAPPI_GLO_SN } from '$app/env/private';
import type { HalfHourUse, Live, OctopusStatus, Slot, UsageStatus } from '#lib/energy.ts';
import { addDays, dayKey, ukTime } from '#lib/time.ts';
import { orElse } from '../fallback.ts';
import { now } from '../now.ts';
import { dataPath } from '../paths.ts';
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

/** Where the energy comes from, so tests can stand in for Octopus, the Zappi, the disk and the clock. */
export interface EnergySources {
	/** The Household's Octopus account, or null for sample rates. */
	octopus: Pick<Octopus, 'tariff' | 'slots'> | null;
	/** The Zappi, through myenergi, or null for sample usage. */
	zappi: Pick<Myenergi, 'live' | 'minutes'> | null;
	/** Where the usage is added up, opened the first time it's needed. */
	openStore: () => UsageStore;
	/** Files in the data folder. */
	files: { read: <T>(name: string) => Promise<T | null>; write: (name: string, value: unknown) => Promise<void> };
	/** Milliseconds since 1970. */
	clock: () => number;
}

type Rates = Pick<EnergyResult, 'tariff' | 'slots' | 'status'> & { needsAlex: string | null };
type Usage = Pick<EnergyResult, 'today' | 'yesterday' | 'live' | 'usageStatus'> & { needsAlex: string | null };

let energy: (() => Promise<EnergyResult>) | undefined;

/** Octopus's rates and slots, and the Zappi's usage, once they're set up. Otherwise samples. */
export function loadEnergy(): Promise<EnergyResult> {
	energy ??= createEnergy(fromSettings());
	return energy();
}

/**
 * Octopus once OCTOPUS_ACCOUNT and OCTOPUS_API_KEY are set, and the Zappi once ZAPPI_GLO_SN and ZAPPI_GLO_API_KEY are.
 * CALENDAR_SOURCE=sample forces samples for both.
 */
function fromSettings(): EnergySources {
	const sample = CALENDAR_SOURCE === 'sample';
	return {
		octopus: !sample && OCTOPUS_ACCOUNT && OCTOPUS_API_KEY ? new Octopus(OCTOPUS_ACCOUNT, OCTOPUS_API_KEY) : null,
		zappi: !sample && ZAPPI_GLO_SN && ZAPPI_GLO_API_KEY ? new Myenergi(ZAPPI_GLO_SN, ZAPPI_GLO_API_KEY) : null,
		openStore: () => openUsageStore(dataPath(DATABASE)),
		files: { read: readJson, write: writeJson },
		clock: () => now().getTime()
	};
}

const noRates: Rates = { tariff: null, slots: [], status: { kind: 'stale', updatedAt: null }, needsAlex: null };
const noUsage: Usage = {
	today: [],
	yesterday: [],
	live: null,
	usageStatus: { kind: 'stale', updatedAt: null },
	needsAlex: null
};

/** The earlier of two runs of failures that need Alex. */
function earlier(a: string | null, b: string | null): string | null {
	return a && b ? (a < b ? a : b) : (a ?? b);
}

// The rates are fixed for the tariff's term, so once a day is enough to notice a renewal.
const TARIFF_MS = 24 * 3600_000;
// Octopus reschedules slots through the day, but only while the car is plugged in; unplugged, hourly is enough.
export const SLOTS_MS = 10 * 60_000;
export const SLOTS_UNPLUGGED_MS = 60 * 60_000;

// Live demand changes by the second, but once a minute is plenty for the wall.
const LIVE_MS = 60_000;
// After this long without hearing from the Zappi, Live demand isn't shown rather than shown out of date.
export const LIVE_STALE_MS = 5 * 60_000;
export const HISTORY_MS = 15 * 60_000;
// myenergi takes a little while to finish a day's history.
export const SETTLED_MS = 60 * 60_000;
const DATABASE = 'energy.db';

/**
 * Loads Octopus's rates and slots, and the Zappi's usage, each in the background. Each falls back on its own, so one
 * failing leaves the other.
 */
export function createEnergy({ octopus, zappi, openStore, files, clock }: EnergySources): () => Promise<EnergyResult> {
	const at = () => new Date(clock());
	// The Zappi's last status, which also says how often to ask Octopus for slots.
	let lastLive: Snapshot<Live> | null = null;

	/** A file in the data folder, read and written in the shape the sync keeps. */
	function onDisk<T>(file: string) {
		return { load: () => files.read<Kept<T>>(file), save: (k: Kept<T>) => files.write(file, k) };
	}

	let octopusSyncs: { tariff: Sync<Tariff>; slots: Sync<Slot[]> } | undefined;

	/** The background syncs for the tariff and slots, both kept on disk so past slots still cost yesterday after a restart. */
	function startOctopus(client: NonNullable<EnergySources['octopus']>) {
		const tariff = createSync({
			name: 'Octopus tariff',
			fetch: () => client.tariff(),
			everyMs: TARIFF_MS,
			clock,
			...onDisk<Tariff>('energy-tariff.json')
		});
		// Past slots Octopus no longer lists are kept, so a Half-hour is still costed at the Off-peak rate after its slot.
		let kept: Slot[] = [];
		const slotsFile = onDisk<Slot[]>('energy-slots.json');
		const slots = createSync({
			name: 'Octopus slots',
			fetch: async () => {
				const since = ukTime(addDays(dayKey(at()), -1), '00:00');
				kept = merge(kept, await client.slots(), at()).filter((s) => new Date(s.to) > since);
				return kept;
			},
			// Until the Zappi has said, assume the car might be plugged in.
			everyMs: () => (lastLive?.value?.car === 'unplugged' ? SLOTS_UNPLUGGED_MS : SLOTS_MS),
			clock,
			load: async () => {
				const k = await slotsFile.load();
				kept = k?.value ?? [];
				return k;
			},
			save: slotsFile.save
		});
		return { tariff, slots };
	}

	async function loadRates(when: Date): Promise<Rates> {
		if (!octopus)
			return { tariff: sampleTariff, slots: sampleSlots(when), status: { kind: 'sample' }, needsAlex: null };
		octopusSyncs ??= startOctopus(octopus);
		const [tariff, slots] = await Promise.all([octopusSyncs.tariff.read(), octopusSyncs.slots.read()]);
		const needsAlex = earlier(tariff.needsAlex, slots.needsAlex);
		if (tariff.error instanceof UnsupportedTariff) {
			return { tariff: null, slots: [], status: { kind: 'unsupported', tariff: tariff.error.tariff }, needsAlex };
		}
		const since = ukTime(addDays(dayKey(when), -1), '00:00');
		const recent = (slots.value ?? []).filter((s) => new Date(s.to) > since);
		// The older of the two, so the Hub never claims to be fresher than it is.
		const updatedAt = [tariff.at, slots.at].filter((t) => t !== null).sort()[0] ?? null;
		const status: OctopusStatus =
			tariff.error || slots.error || !updatedAt ? { kind: 'stale', updatedAt } : { kind: 'live', updatedAt };
		return { tariff: tariff.value, slots: recent, status, needsAlex };
	}

	let zappiSyncs: { live: Sync<Live>; history: Sync<true>; store: UsageStore } | undefined;

	/** The background syncs for the Zappi's status and history, with the history added up into the usage store. */
	function startZappi(client: NonNullable<EnergySources['zappi']>) {
		const store = openStore();
		// UTC days whose whole history is already in the store.
		const settled = new Set<string>();
		const live = createSync({ name: 'Zappi status', fetch: () => client.live(), everyMs: LIVE_MS, clock });
		const history = createSync({
			name: 'Zappi history',
			fetch: async () => {
				const since = ukTime(addDays(dayKey(at()), -1), '00:00');
				for (const day of utcDays(since, at()).filter((d) => !settled.has(d))) {
					store.save(toHalfHours(await client.minutes(day)));
					if (clock() > Date.parse(`${day}T00:00:00Z`) + 24 * 3600_000 + SETTLED_MS) settled.add(day);
				}
				return true as const;
			},
			everyMs: HISTORY_MS,
			clock
		});
		return { live, history, store };
	}

	async function loadUsage(when: Date): Promise<Usage> {
		if (!zappi) return { ...sampleUsage(when), usageStatus: { kind: 'sample' }, needsAlex: null };
		zappiSyncs ??= startZappi(zappi);
		const [live, history] = await Promise.all([zappiSyncs.live.read(), zappiSyncs.history.read()]);
		lastLive = live;
		const midnight = ukTime(dayKey(when), '00:00');
		const since = ukTime(addDays(dayKey(when), -1), '00:00');
		const fresh = live.value !== null && live.at !== null && clock() - Date.parse(live.at) < LIVE_STALE_MS;
		return {
			today: zappiSyncs.store.between(midnight, when),
			yesterday: zappiSyncs.store.between(since, midnight),
			live: fresh ? live.value : null,
			usageStatus: fresh ? { kind: 'live', updatedAt: live.at! } : { kind: 'stale', updatedAt: live.at },
			needsAlex: earlier(live.needsAlex, history.needsAlex)
		};
	}

	return async () => {
		const when = at();
		const [rates, usage] = await Promise.all([
			orElse('Octopus', () => loadRates(when), noRates),
			orElse('Zappi', () => loadUsage(when), noUsage)
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
	};
}
