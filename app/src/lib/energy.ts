// Intelligent Octopus Go and what the Hub works out from it: whether it's cheap now, the next cheap time, when to run
// Hungry appliances, and what each Half-hour cost.
import { addDays, dayKey, formatTime, ukTime, type DayKey } from './time.ts';

/** The tariff's two prices, in pence per kWh, as Octopus reports them. */
export interface Rates {
	peak: number;
	offPeak: number;
}

/** A Smart-charging slot, planned or past, as ISO instants. */
export interface Slot {
	from: string;
	to: string;
}

/** The Off-peak window, in UK time, every night. Part of the tariff, not something Octopus's API gives. */
export const OFF_PEAK_FROM = '23:30';
export const OFF_PEAK_TO = '05:30';

/** Where the rates and Smart-charging slots came from. */
export type OctopusStatus =
	| { kind: 'sample' }
	| { kind: 'live'; updatedAt: string }
	| { kind: 'stale'; updatedAt: string | null }
	/** The account's tariff isn't Intelligent Octopus Go, so the Hub won't guess its times. */
	| { kind: 'unsupported'; tariff: string };

/** Where the usage came from: made up, fresh from the Zappi, or the Zappi hasn't reported since `updatedAt`. */
export type UsageStatus =
	| { kind: 'sample' }
	| { kind: 'live'; updatedAt: string }
	| { kind: 'stale'; updatedAt: string | null };

/** What the Car is doing, from the Zappi. */
export type CarState = 'unplugged' | 'plugged' | 'charging';

/** Live demand: what the whole house, car included, draws from the grid now. */
export interface Live {
	watts: number;
	car: CarState;
}

/** One Half-hour's House use and Car charging, in kWh. */
export interface HalfHourUse {
	/** The Half-hour's start, as an ISO instant. */
	from: string;
	house: number;
	car: number;
}

/** A Hungry appliance and how long it runs. */
export interface Appliance {
	name: string;
	halfHours: number;
}

export const appliances: Appliance[] = [
	{ name: 'Dishwasher', halfHours: 6 },
	{ name: 'Washing machine', halfHours: 2 },
	{ name: 'Tumble drier', halfHours: 4 }
];

const HALF_HOUR_MS = 30 * 60_000;

export type Band = 'off-peak' | 'slot' | 'peak';

export function inOffPeakWindow(at: Date): boolean {
	const time = formatTime(at);
	return time >= OFF_PEAK_FROM || time < OFF_PEAK_TO;
}

/** Whether `at` is in the Off-peak window, else a Smart-charging slot, else Peak. */
export function bandAt(at: Date, slots: Slot[]): Band {
	if (inOffPeakWindow(at)) return 'off-peak';
	const t = at.getTime();
	return slots.some((s) => new Date(s.from).getTime() <= t && t < new Date(s.to).getTime()) ? 'slot' : 'peak';
}

export function rateAt(at: Date, rates: Rates, slots: Slot[]): number {
	return bandAt(at, slots) === 'peak' ? rates.peak : rates.offPeak;
}

/** A stretch of time at the Off-peak rate: an Off-peak window, a Smart-charging slot, or both back to back. */
export interface CheapTime {
	from: string;
	to: string;
	/** True when it's only Smart-charging slots, with no part of the Off-peak window. */
	slot: boolean;
}

/** The cheap times that overlap `from` to `until`, with touching ones joined, in time order. */
export function cheapTimes(from: Date, until: Date, slots: Slot[]): CheapTime[] {
	const all: { from: number; to: number; slot: boolean }[] = [];
	for (let day = addDays(dayKey(from), -1); day <= dayKey(until); day = addDays(day, 1)) {
		all.push({
			from: ukTime(day, OFF_PEAK_FROM).getTime(),
			to: ukTime(addDays(day, 1), OFF_PEAK_TO).getTime(),
			slot: false
		});
	}
	for (const s of slots)
		all.push({
			from: new Date(s.from).getTime(),
			to: new Date(s.to).getTime(),
			slot: true
		});
	all.sort((a, b) => a.from - b.from);

	const joined: typeof all = [];
	for (const c of all) {
		const last = joined.at(-1);
		if (last && c.from <= last.to) {
			last.to = Math.max(last.to, c.to);
			last.slot &&= c.slot;
		} else joined.push({ ...c });
	}
	return joined
		.filter((c) => c.to > from.getTime() && c.from < until.getTime())
		.map((c) => ({
			from: new Date(c.from).toISOString(),
			to: new Date(c.to).toISOString(),
			slot: c.slot
		}));
}

/** The cheap time `at` is in, if any, the next one after it, and the one after that. */
export function cheapNow(at: Date, slots: Slot[]): { current: CheapTime | null; next: CheapTime; then: CheapTime } {
	const times = cheapTimes(at, new Date(at.getTime() + 3 * 24 * 3600_000), slots);
	const current = times.find((c) => new Date(c.from) <= at) ?? null;
	// There's an Off-peak window every night, so there are always two more.
	const [next, then] = times.filter((c) => new Date(c.from) > at) as [CheapTime, CheapTime];
	return { current, next, then };
}

/** When to start an appliance so it finishes in a cheap time: any time from `earliest` to `latest`. */
export interface BestStart {
	earliest: string;
	latest: string;
	slot: boolean;
}

/**
 * The first cheap time, from `at` on, long enough for `halfHours`. The Off-peak window lasts six hours every night, so
 * any Hungry appliance fits in the next one at the latest.
 */
export function bestStart(at: Date, halfHours: number, slots: Slot[]): BestStart {
	const length = halfHours * HALF_HOUR_MS;
	for (const c of cheapTimes(at, new Date(at.getTime() + 2 * 24 * 3600_000), slots)) {
		const earliest = Math.max(new Date(c.from).getTime(), at.getTime());
		const latest = new Date(c.to).getTime() - length;
		if (latest >= earliest) {
			return {
				earliest: new Date(earliest).toISOString(),
				latest: new Date(latest).toISOString(),
				slot: c.slot
			};
		}
	}
	throw new Error(`Nothing cheap is long enough for ${halfHours} Half-hours`);
}

/** Every Half-hour's start in a UK day: 48, or 46 and 50 when the clocks change. */
export function halfHoursOf(day: DayKey): Date[] {
	const end = ukTime(addDays(day, 1), '00:00').getTime();
	const starts: Date[] = [];
	for (let t = ukTime(day, '00:00').getTime(); t < end; t += HALF_HOUR_MS) starts.push(new Date(t));
	return starts;
}

/** A day's usage added up, with costs in pence, usage only. */
export interface Totals {
	house: number;
	car: number;
	houseCost: number;
	carCost: number;
	/** The share of House use, 0 to 1, at the Off-peak rate. */
	houseOffPeak: number;
}

export function totals(use: HalfHourUse[], rates: Rates, slots: Slot[]): Totals {
	const t: Totals = {
		house: 0,
		car: 0,
		houseCost: 0,
		carCost: 0,
		houseOffPeak: 0
	};
	let cheapHouse = 0;
	for (const u of use) {
		const rate = rateAt(new Date(u.from), rates, slots);
		t.house += u.house;
		t.car += u.car;
		t.houseCost += u.house * rate;
		t.carCost += u.car * rate;
		if (rate === rates.offPeak) cheapHouse += u.house;
	}
	t.houseOffPeak = t.house > 0 ? cheapHouse / t.house : 0;
	return t;
}

/** For example "27.4p". */
export function formatPence(pence: number): string {
	return `${(Math.round(pence * 10) / 10).toFixed(1)}p`;
}

/** For example "£1.12". */
export function formatPounds(pence: number): string {
	return `£${(Math.round(pence) / 100).toFixed(2)}`;
}

/** For example "0.8 kW". */
export function formatKw(watts: number): string {
	return `${(watts / 1000).toFixed(1)} kW`;
}

/** For example "11.4 kWh". */
export function formatKwh(kwh: number): string {
	return `${kwh.toFixed(1)} kWh`;
}

/** For example "1 hour", "1½ hours" or "3 hours". */
export function formatLength(halfHours: number): string {
	const hours = Math.floor(halfHours / 2);
	const half = halfHours % 2 === 1 ? '½' : '';
	if (hours === 0) return '30 minutes';
	return `${hours}${half} ${hours === 1 && !half ? 'hour' : 'hours'}`;
}

/** For example "23:30–02:30", "Now–02:30", or "13:00" when there's only one time to start. */
export function formatStarts(best: BestStart, at: Date): string {
	const earliest = new Date(best.earliest);
	const from = earliest.getTime() <= at.getTime() ? 'Now' : formatTime(earliest);
	return best.earliest === best.latest ? from : `${from}–${formatTime(new Date(best.latest))}`;
}

export const carText: Record<CarState, string> = {
	unplugged: 'Car not plugged in',
	plugged: 'Car plugged in, not charging',
	charging: 'Car charging'
};
