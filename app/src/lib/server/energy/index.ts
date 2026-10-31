import { CALENDAR_SOURCE, OCTOPUS_ACCOUNT, OCTOPUS_API_KEY } from '$app/env/private';
import type { HalfHourUse, Live, OctopusStatus, Slot, UsageStatus } from '#lib/energy.ts';
import { addDays, dayKey, ukTime } from '#lib/time.ts';
import { now } from '../now.ts';
import { readJson, writeJson } from '../store.ts';
import { merge, Octopus, UnsupportedTariff, type Tariff } from './octopus.ts';
import { sampleSlots, sampleTariff, sampleUsage } from './sample.ts';

export interface EnergyResult {
	/** Null when Octopus has never answered, or the account isn't on Intelligent Octopus Go. */
	tariff: Tariff | null;
	/** Smart-charging slots from the start of yesterday on, past and planned. */
	slots: Slot[];
	status: OctopusStatus;
	/** Today's Half-hours so far, and all of yesterday's. */
	today: HalfHourUse[];
	yesterday: HalfHourUse[];
	live: Live | null;
	usageStatus: UsageStatus;
}

// The rates are fixed for the tariff's term, so once a day is enough to notice a renewal.
const TARIFF_MS = 24 * 3600_000;
// Octopus reschedules slots through the day.
const SLOTS_MS = 10 * 60_000;
// Kept on disk so the Section survives a restart without internet, and past slots still cost yesterday.
const TARIFF_FILE = 'energy-tariff.json';
const SLOTS_FILE = 'energy-slots.json';

interface Kept<T> {
	value: T;
	at: string;
}

let octopus: Octopus | undefined;
let tariff: Kept<Tariff> | null | undefined;
let slots: Kept<Slot[]> | null | undefined;
// The tariff's name, when it isn't one the Hub knows. Asked about again with the tariff, in case it changes.
let unsupported: Kept<string> | null = null;

/**
 * The tariff and Smart-charging slots from the Household's Octopus account once OCTOPUS_ACCOUNT and OCTOPUS_API_KEY are
 * set, otherwise sample ones. CALENDAR_SOURCE=sample forces samples too. Usage is always sample for now.
 */
export async function loadEnergy(): Promise<EnergyResult> {
	const at = now();
	const usage = {
		...sampleUsage(at),
		usageStatus: { kind: 'sample' } as const
	};
	if (CALENDAR_SOURCE === 'sample' || !OCTOPUS_ACCOUNT || !OCTOPUS_API_KEY) {
		return {
			tariff: sampleTariff,
			slots: sampleSlots(at),
			status: { kind: 'sample' },
			...usage
		};
	}
	octopus ??= new Octopus(OCTOPUS_ACCOUNT, OCTOPUS_API_KEY);
	tariff ??= await readJson<Kept<Tariff>>(TARIFF_FILE);
	slots ??= await readJson<Kept<Slot[]>>(SLOTS_FILE);
	const since = ukTime(addDays(dayKey(at), -1), '00:00');
	const recent = (s: Slot[]) => s.filter((slot) => new Date(slot.to) > since);

	if (unsupported && !due(unsupported, TARIFF_MS, at)) {
		return {
			tariff: null,
			slots: [],
			status: { kind: 'unsupported', tariff: unsupported.value },
			...usage
		};
	}
	try {
		if (!tariff || due(tariff, TARIFF_MS, at)) {
			tariff = { value: await octopus.tariff(), at: new Date().toISOString() };
			unsupported = null;
			await writeJson(TARIFF_FILE, tariff);
		}
		if (!slots || due(slots, SLOTS_MS, at)) {
			const fetched = await octopus.slots();
			slots = {
				value: recent(merge(slots?.value ?? [], fetched, at)),
				at: new Date().toISOString()
			};
			await writeJson(SLOTS_FILE, slots);
		}
		return {
			tariff: tariff.value,
			slots: slots.value,
			status: { kind: 'live', updatedAt: oldest()! },
			...usage
		};
	} catch (e) {
		if (e instanceof UnsupportedTariff) {
			unsupported = { value: e.tariff, at: new Date().toISOString() };
			return {
				tariff: null,
				slots: [],
				status: { kind: 'unsupported', tariff: e.tariff },
				...usage
			};
		}
		console.error('Octopus fetch failed:', e instanceof Error ? e.message : e);
		return {
			tariff: tariff?.value ?? null,
			slots: recent(slots?.value ?? []),
			status: { kind: 'stale', updatedAt: oldest() },
			...usage
		};
	}
}

/** When the older of the tariff and the slots was fetched. */
function oldest(): string | null {
	return [tariff?.at, slots?.at].filter((at) => at !== undefined).sort()[0] ?? null;
}

function due(kept: Kept<unknown>, ms: number, at: Date): boolean {
	return dayKey(new Date(kept.at)) !== dayKey(at) || Date.now() - new Date(kept.at).getTime() > ms;
}
