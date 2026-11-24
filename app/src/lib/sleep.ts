// Sleep: the Hub's overnight state, a dim clock and the next Event. Lights out: part of Sleep with the screen dark.
import { formatTime, ukTime, type ClockFormat } from './time.ts';

/** UK wall-clock times (`HH:mm`). `from` after `until` means overnight. */
export interface SleepSchedule {
	from: string;
	until: string;
}

/** When the Hub sleeps, and when its screen is dark within that, chosen in Settings (ADR 0012). */
export interface SleepHours {
	sleep: SleepSchedule;
	lightsOut: SleepSchedule;
	/** Off keeps Lights out's times, so turning it on again brings them back. */
	lightsOutOn: boolean;
}

export const DEFAULT_SLEEP_HOURS: SleepHours = {
	sleep: { from: '22:00', until: '06:30' },
	lightsOut: { from: '00:00', until: '06:00' },
	lightsOutOn: true
};

/** How long a touch keeps the Hub awake during Sleep hours, and its screen lit during Lights out. */
export const AWAKE_MS = 2 * 60_000;

/** How far each − and + in Settings moves a time. */
export const STEP_MINUTES = 30;

const DAY_MINUTES = 24 * 60;
const minutes = (hhmm: string) => {
	const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
	return hour * 60 + minute;
};
const hhmm = (total: number) => {
	const m = ((total % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function inSleepHours(now: Date, schedule: SleepSchedule): boolean {
	const time = formatTime(now);
	return schedule.from > schedule.until
		? time >= schedule.from || time < schedule.until
		: time >= schedule.from && time < schedule.until;
}

/** In Sleep hours, unless the screen was touched in the last two minutes. */
export function isAsleep(now: Date, lastTouch: Date | null, schedule: SleepSchedule): boolean {
	return inSleepHours(now, schedule) && (lastTouch === null || now.getTime() - lastTouch.getTime() >= AWAKE_MS);
}

/** Whether it's Lights out hours, before any touch. The screen service on the Pi adds the touches. */
export function inLightsOut(now: Date, hours: SleepHours): boolean {
	return hours.lightsOutOn && inSleepHours(now, hours.lightsOut);
}

/** One of the four times in Settings. */
export type SleepTime = 'sleepFrom' | 'sleepUntil' | 'lightsOutFrom' | 'lightsOutUntil';
export const sleepTimes: SleepTime[] = ['sleepFrom', 'sleepUntil', 'lightsOutFrom', 'lightsOutUntil'];

/**
 * The hours with one time moved by `delta` minutes, or null if that isn't allowed. Both stay at least one step long, Sleep
 * stays under a day, and Lights out stays inside Sleep: moving Sleep in past Lights out moves Lights out with it.
 */
export function stepHours(hours: SleepHours, time: SleepTime, delta: number): SleepHours | null {
	// Every time as minutes after Sleep starts, so overnight hours are just numbers in order.
	const start = minutes(hours.sleep.from);
	const at = (t: string) => (((minutes(t) - start) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
	let sleepFrom = 0;
	let sleepUntil = at(hours.sleep.until) || DAY_MINUTES;
	let lightsFrom = at(hours.lightsOut.from);
	let lightsUntil = at(hours.lightsOut.until) || DAY_MINUTES;

	if (time === 'sleepFrom') sleepFrom += delta;
	else if (time === 'sleepUntil') sleepUntil += delta;
	else if (time === 'lightsOutFrom') lightsFrom += delta;
	else lightsUntil += delta;

	if (time === 'sleepFrom' || time === 'sleepUntil') {
		lightsFrom = Math.max(lightsFrom, sleepFrom);
		lightsUntil = Math.min(lightsUntil, sleepUntil);
	}
	const fits =
		sleepUntil - sleepFrom >= STEP_MINUTES &&
		sleepUntil - sleepFrom < DAY_MINUTES &&
		lightsFrom >= sleepFrom &&
		lightsUntil <= sleepUntil &&
		lightsUntil - lightsFrom >= STEP_MINUTES;
	if (!fits) return null;
	return {
		sleep: { from: hhmm(start + sleepFrom), until: hhmm(start + sleepUntil) },
		lightsOut: { from: hhmm(start + lightsFrom), until: hhmm(start + lightsUntil) },
		lightsOutOn: hours.lightsOutOn
	};
}

/** Saved hours, or the defaults if they're missing or not hours the steps could have made. */
export function validSleepHours(saved: unknown): SleepHours {
	const time = /^([01]\d|2[0-3]):[0-5]\d$/;
	const s = saved as Partial<SleepHours> | undefined;
	const valid =
		typeof s?.lightsOutOn === 'boolean' &&
		[s.sleep?.from, s.sleep?.until, s.lightsOut?.from, s.lightsOut?.until].every(
			(t) => typeof t === 'string' && time.test(t)
		) &&
		// Moving nothing keeps them as they are only if they already fit.
		stepHours(s as SleepHours, 'sleepFrom', 0) !== null;
	return valid ? (s as SleepHours) : DEFAULT_SLEEP_HOURS;
}

/** A Sleep time as the Household has chosen to see times: "22:00" or "10:00 pm". */
export function showSleepTime(time: string, format: ClockFormat): string {
	// Any winter day: only the wall-clock time matters.
	return formatTime(ukTime('2026-01-01', time), format);
}

/** Sleep's colours, whatever the theme: dimmer than the Evening theme, for a dark kitchen. From the Sleep mockup. */
export const sleepPalette = {
	bg: '#05070A',
	clock: '#9AA4B4',
	text: '#8B95A5',
	event: '#A6B0BF',
	line: '#232A35',
	hint: '#7B8696'
};
