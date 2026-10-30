// Sleep: the Hub's overnight state, a dim clock and the next Event.
import { formatTime } from './time.ts';

/** UK wall-clock times (`HH:mm`). `from` after `until` means overnight. */
export interface SleepSchedule {
	from: string;
	until: string;
}

/** When the Hub sleeps. It lives here, so changing it is a pull request. */
export const sleepSchedule: SleepSchedule = { from: '22:00', until: '06:30' };

/** How long a touch keeps the Hub awake during Sleep hours. */
export const AWAKE_MS = 2 * 60_000;

export function inSleepHours(now: Date, schedule: SleepSchedule = sleepSchedule): boolean {
	const time = formatTime(now);
	return schedule.from > schedule.until
		? time >= schedule.from || time < schedule.until
		: time >= schedule.from && time < schedule.until;
}

/** In Sleep hours, unless the screen was touched in the last two minutes. */
export function isAsleep(now: Date, lastTouch: Date | null, schedule: SleepSchedule = sleepSchedule): boolean {
	return inSleepHours(now, schedule) && (lastTouch === null || now.getTime() - lastTouch.getTime() >= AWAKE_MS);
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
