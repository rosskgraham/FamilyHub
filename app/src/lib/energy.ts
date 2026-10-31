// Agile rates and what the Hub works out from them: Price bands, Cheap windows and when to run Hungry appliances.
import { dayKey, formatTime } from './time.ts';

/** What Octopus charges per kWh for one Half-hour, including VAT. */
export interface Rate {
	/** The Half-hour's start and end, as ISO instants. */
	from: string;
	to: string;
	/** Pence per kWh. Below zero, the Household is paid to use electricity. */
	pence: number;
}

export type PriceBand = 'cheap' | 'normal' | 'peak';

/** Where the rates came from: made up, fresh from Octopus, or the last ones it sent when it can't be reached. */
export type RatesStatus =
	| { kind: 'sample' }
	| { kind: 'live'; updatedAt: string }
	| { kind: 'stale'; updatedAt: string | null };

/** A Hungry appliance and how long it runs. */
export interface Appliance {
	name: string;
	halfHours: number;
}

export const appliances: Appliance[] = [
	{ name: 'Dishwasher', halfHours: 4 },
	{ name: 'Washing machine', halfHours: 6 },
	{ name: 'Tumble drier', halfHours: 2 }
];

/** How long the Cheap window on the Today view and the Energy tiles is. */
export const CHEAP_WINDOW_HALF_HOURS = 4;

/** Octopus publishes tomorrow's rates by about this time. */
export const TOMORROW_FROM = '16:00';

/**
 * Each rate's Price band. Within each UK day, the cheapest quarter of its Half-hours is Cheap and the dearest quarter
 * Peak, so a day always has some of each however high or low its rates are. Ties go to the earlier Half-hour.
 */
export function priceBands(rates: Rate[]): PriceBand[] {
	const bands: PriceBand[] = rates.map(() => 'normal');
	const days = new Map<string, number[]>();
	rates.forEach((r, i) => {
		const day = dayKey(new Date(r.from));
		days.set(day, [...(days.get(day) ?? []), i]);
	});
	for (const indexes of days.values()) {
		const ranked = [...indexes].sort((a, b) => rates[a]!.pence - rates[b]!.pence || a - b);
		const quarter = Math.ceil(ranked.length / 4);
		ranked.slice(0, quarter).forEach((i) => (bands[i] = 'cheap'));
		ranked.slice(ranked.length - quarter).forEach((i) => {
			if (bands[i] === 'normal') bands[i] = 'peak';
		});
	}
	return bands;
}

/** The rate for the Half-hour that `at` falls in. */
export function rateAt(rates: Rate[], at: Date): Rate | undefined {
	const t = at.getTime();
	return rates.find((r) => new Date(r.from).getTime() <= t && t < new Date(r.to).getTime());
}

export interface CheapWindow {
	from: string;
	to: string;
	/** The average of its Half-hours' rates, in pence per kWh. */
	pence: number;
}

/**
 * The run of `halfHours` back-to-back Half-hours, starting at or after `at`, with the lowest average rate.
 * Earlier wins a tie. Null when the published rates don't stretch that far.
 */
export function cheapestWindow(rates: Rate[], at: Date, halfHours: number): CheapWindow | null {
	const ahead = rates.filter((r) => new Date(r.from) >= at);
	let best: CheapWindow | null = null;
	for (let i = 0; i + halfHours <= ahead.length; i++) {
		const run = ahead.slice(i, i + halfHours);
		if (run.some((r, j) => j > 0 && r.from !== run[j - 1]!.to)) continue;
		const pence = run.reduce((sum, r) => sum + r.pence, 0) / halfHours;
		if (!best || pence < best.pence) best = { from: run[0]!.from, to: run.at(-1)!.to, pence };
	}
	return best;
}

/** For example "24.2p" or "−2.1p". */
export function formatPence(pence: number): string {
	const rounded = Math.round(pence * 10) / 10;
	return `${rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}p`;
}

/** For example "1 hour", "1½ hours" or "3 hours". */
export function formatLength(halfHours: number): string {
	const hours = Math.floor(halfHours / 2);
	const half = halfHours % 2 === 1 ? '½' : '';
	if (hours === 0) return '30 minutes';
	return `${hours}${half} ${hours === 1 && !half ? 'hour' : 'hours'}`;
}

/** For example "13:00–15:00", or "02:00–04:00 tomorrow" when it starts on a later day than `at`. */
export function formatWindow(window: CheapWindow, at: Date): string {
	const from = new Date(window.from);
	const later = dayKey(from) !== dayKey(at) ? ' tomorrow' : '';
	return `${formatTime(from)}–${formatTime(new Date(window.to))}${later}`;
}

/** For example "13:00", or "02:00 tomorrow". */
export function formatStart(window: CheapWindow, at: Date): string {
	const from = new Date(window.from);
	return `${formatTime(from)}${dayKey(from) !== dayKey(at) ? ' tomorrow' : ''}`;
}
