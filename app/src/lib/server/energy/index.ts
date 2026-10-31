import { CALENDAR_SOURCE, OCTOPUS_AGILE_PRODUCT, OCTOPUS_REGION } from '$app/env/private';
import { TOMORROW_FROM, type Rate, type RatesStatus } from '#lib/energy.ts';
import { addDays, dayKey, formatTime, ukTime } from '#lib/time.ts';
import { now } from '../now.ts';
import { readJson, writeJson } from '../store.ts';
import { fetchRates } from './octopus.ts';
import { sampleRates } from './sample.ts';

export interface RatesResult {
	/** From midnight today to the last published Half-hour, in time order. */
	rates: Rate[];
	status: RatesStatus;
}

// Rates are published once a day, so hourly is plenty, except while waiting for tomorrow's.
const REFRESH_MS = 60 * 60_000;
const WAITING_MS = 10 * 60_000;
// The last rates Octopus sent, kept on disk so the chart survives a restart without internet.
const RATES_FILE = 'energy-rates.json';

interface Fetched {
	rates: Rate[];
	at: string;
}

let last: Fetched | null | undefined;

/**
 * The Household's Agile rates once OCTOPUS_AGILE_PRODUCT and OCTOPUS_REGION are set, otherwise sample rates.
 * CALENDAR_SOURCE=sample forces sample rates too.
 */
export async function loadRates(): Promise<RatesResult> {
	const at = now();
	if (CALENDAR_SOURCE === 'sample' || !OCTOPUS_AGILE_PRODUCT || !OCTOPUS_REGION) {
		return { rates: sampleRates(at), status: { kind: 'sample' } };
	}
	const today = dayKey(at);
	const from = ukTime(today, '00:00');
	last ??= await readJson<Fetched>(RATES_FILE);
	const since = (rates: Rate[]) => rates.filter((r) => new Date(r.to) > from);

	if (last && !due(last, at)) return { rates: since(last.rates), status: { kind: 'live', updatedAt: last.at } };
	try {
		const rates = await fetchRates(OCTOPUS_AGILE_PRODUCT, OCTOPUS_REGION, from, ukTime(addDays(today, 2), '00:00'));
		const changed = JSON.stringify(rates) !== JSON.stringify(last?.rates);
		last = { rates, at: new Date().toISOString() };
		if (changed) await writeJson(RATES_FILE, last);
		return { rates, status: { kind: 'live', updatedAt: last.at } };
	} catch (e) {
		console.error('Octopus rates fetch failed:', e);
		return { rates: since(last?.rates ?? []), status: { kind: 'stale', updatedAt: last?.at ?? null } };
	}
}

/** Whether it's time to ask Octopus again. */
function due(fetched: Fetched, at: Date): boolean {
	const age = Date.now() - new Date(fetched.at).getTime();
	const today = dayKey(at);
	if (dayKey(new Date(fetched.at)) !== today) return true;
	const tomorrow = addDays(today, 1);
	const waiting = formatTime(at) >= TOMORROW_FROM && !fetched.rates.some((r) => dayKey(new Date(r.from)) === tomorrow);
	return age > (waiting ? WAITING_MS : REFRESH_MS);
}
