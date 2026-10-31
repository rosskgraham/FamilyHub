import { CALENDAR_SOURCE, OCTOPUS_ACCOUNT, OCTOPUS_API_KEY, ZAPPI_GLO_API_KEY, ZAPPI_GLO_SN } from '$app/env/private';
import type { HalfHourUse, Live, OctopusStatus, Slot, UsageStatus } from '#lib/energy.ts';
import { addDays, dayKey, ukTime } from '#lib/time.ts';
import { now } from '../now.ts';
import { readJson, writeJson } from '../store.ts';
import { Myenergi, toHalfHours, utcDays } from './myenergi.ts';
import { merge, Octopus, UnsupportedTariff, type Tariff } from './octopus.ts';
import { sampleSlots, sampleTariff, sampleUsage } from './sample.ts';
import { openUsageStore, type UsageStore } from './usage-store.ts';

export interface EnergyResult extends Rates, Usage {}

interface Rates {
	/** Null when Octopus has never answered, or the account isn't on Intelligent Octopus Go. */
	tariff: Tariff | null;
	/** Smart-charging slots from the start of yesterday on, past and planned. */
	slots: Slot[];
	status: OctopusStatus;
}

interface Usage {
	/** Today's Half-hours so far, and all of yesterday's. */
	today: HalfHourUse[];
	yesterday: HalfHourUse[];
	/** Null when the Zappi hasn't reported for a while. */
	live: Live | null;
	usageStatus: UsageStatus;
}

/** Octopus's rates and slots, and the Zappi's usage. Each falls back on its own, so one failing leaves the other. */
export async function loadEnergy(): Promise<EnergyResult> {
	const at = now();
	const [rates, usage] = await Promise.all([loadRates(at), loadUsage(at)]);
	return { ...rates, ...usage };
}

interface Kept<T> {
	value: T;
	at: string;
}

function due(kept: Kept<unknown>, ms: number, at: Date): boolean {
	return dayKey(new Date(kept.at)) !== dayKey(at) || Date.now() - new Date(kept.at).getTime() > ms;
}

// The rates are fixed for the tariff's term, so once a day is enough to notice a renewal.
const TARIFF_MS = 24 * 3600_000;
// Octopus reschedules slots through the day.
const SLOTS_MS = 10 * 60_000;
// Kept on disk so the Section survives a restart without internet, and past slots still cost yesterday.
const TARIFF_FILE = 'energy-tariff.json';
const SLOTS_FILE = 'energy-slots.json';

let octopus: Octopus | undefined;
let tariff: Kept<Tariff> | null | undefined;
let slots: Kept<Slot[]> | null | undefined;
// The tariff's name, when it isn't one the Hub knows. Asked about again with the tariff, in case it changes.
let unsupported: Kept<string> | null = null;

/**
 * The tariff and Smart-charging slots from the Household's Octopus account once OCTOPUS_ACCOUNT and OCTOPUS_API_KEY are
 * set, otherwise sample ones. CALENDAR_SOURCE=sample forces samples too.
 */
async function loadRates(at: Date): Promise<Rates> {
	if (CALENDAR_SOURCE === 'sample' || !OCTOPUS_ACCOUNT || !OCTOPUS_API_KEY) {
		return { tariff: sampleTariff, slots: sampleSlots(at), status: { kind: 'sample' } };
	}
	if (unsupported && !due(unsupported, TARIFF_MS, at)) {
		return { tariff: null, slots: [], status: { kind: 'unsupported', tariff: unsupported.value } };
	}
	octopus ??= new Octopus(OCTOPUS_ACCOUNT, OCTOPUS_API_KEY);
	tariff ??= await readJson<Kept<Tariff>>(TARIFF_FILE);
	slots ??= await readJson<Kept<Slot[]>>(SLOTS_FILE);
	const since = ukTime(addDays(dayKey(at), -1), '00:00');
	const recent = (s: Slot[]) => s.filter((slot) => new Date(slot.to) > since);
	// When the older of the tariff and the slots was fetched.
	const oldest = () => [tariff?.at, slots?.at].filter((t) => t !== undefined).sort()[0] ?? null;

	try {
		if (!tariff || due(tariff, TARIFF_MS, at)) {
			tariff = { value: await octopus.tariff(), at: new Date().toISOString() };
			unsupported = null;
			await writeJson(TARIFF_FILE, tariff);
		}
		if (!slots || due(slots, SLOTS_MS, at)) {
			const fetched = await octopus.slots();
			slots = { value: recent(merge(slots?.value ?? [], fetched, at)), at: new Date().toISOString() };
			await writeJson(SLOTS_FILE, slots);
		}
		return { tariff: tariff.value, slots: slots.value, status: { kind: 'live', updatedAt: oldest()! } };
	} catch (e) {
		if (e instanceof UnsupportedTariff) {
			unsupported = { value: e.tariff, at: new Date().toISOString() };
			return { tariff: null, slots: [], status: { kind: 'unsupported', tariff: e.tariff } };
		}
		console.error('Octopus fetch failed:', e instanceof Error ? e.message : e);
		return {
			tariff: tariff?.value ?? null,
			slots: recent(slots?.value ?? []),
			status: { kind: 'stale', updatedAt: oldest() }
		};
	}
}

// Live demand changes by the second, but once a minute is plenty for the wall.
const LIVE_MS = 60_000;
// After this long without hearing from the Zappi, Live demand isn't shown rather than shown out of date.
const LIVE_STALE_MS = 5 * 60_000;
const HISTORY_MS = 15 * 60_000;
// myenergi takes a little while to finish a day's history.
const SETTLED_MS = 60 * 60_000;
const DATABASE = 'data/energy.db';

let myenergi: Myenergi | undefined;
let store: UsageStore | undefined;
let live: Kept<Live> | null = null;
let historyAt = 0;
// UTC days whose whole history is already in the store.
const settled = new Set<string>();

/**
 * House use, Car charging and Live demand from the Zappi once ZAPPI_GLO_SN and ZAPPI_GLO_API_KEY are set, otherwise
 * sample ones. CALENDAR_SOURCE=sample forces samples too.
 */
async function loadUsage(at: Date): Promise<Usage> {
	if (CALENDAR_SOURCE === 'sample' || !ZAPPI_GLO_SN || !ZAPPI_GLO_API_KEY) {
		return { ...sampleUsage(at), usageStatus: { kind: 'sample' } };
	}
	myenergi ??= new Myenergi(ZAPPI_GLO_SN, ZAPPI_GLO_API_KEY);
	store ??= openUsageStore(DATABASE);
	const midnight = ukTime(dayKey(at), '00:00');
	const since = ukTime(addDays(dayKey(at), -1), '00:00');

	if (!live || Date.now() - new Date(live.at).getTime() > LIVE_MS) {
		try {
			live = { value: await myenergi.live(), at: new Date().toISOString() };
		} catch (e) {
			console.error('myenergi status failed:', e instanceof Error ? e.message : e);
		}
	}
	if (Date.now() - historyAt > HISTORY_MS) {
		try {
			for (const day of utcDays(since, at).filter((d) => !settled.has(d))) {
				store.save(toHalfHours(await myenergi.minutes(day)));
				if (Date.now() > Date.parse(`${day}T00:00:00Z`) + 24 * 3600_000 + SETTLED_MS) settled.add(day);
			}
			historyAt = Date.now();
		} catch (e) {
			// The chart misses the latest Half-hours until the next try; the status is what says the Zappi is down.
			console.error('myenergi history failed:', e instanceof Error ? e.message : e);
		}
	}

	const fresh = live !== null && Date.now() - new Date(live.at).getTime() < LIVE_STALE_MS;
	return {
		today: store.between(midnight, at),
		yesterday: store.between(since, midnight),
		live: fresh ? live!.value : null,
		usageStatus: fresh ? { kind: 'live', updatedAt: live!.at } : { kind: 'stale', updatedAt: live?.at ?? null }
	};
}
