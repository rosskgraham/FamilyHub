// The Hub always works in UK time, whatever the machine's own time zone.
export const TIME_ZONE = 'Europe/London';

/** A calendar day in UK time, as `YYYY-MM-DD`. */
export type DayKey = string;

const keyFormat = new Intl.DateTimeFormat('en-CA', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

const partsFormat = new Intl.DateTimeFormat('en-GB', {
	timeZone: TIME_ZONE,
	hourCycle: 'h23',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit'
});

/** How times are shown on the screen, chosen in Settings. */
export type ClockFormat = '24h' | '12h';
export const clockFormats: ClockFormat[] = ['24h', '12h'];
export const DEFAULT_CLOCK_FORMAT: ClockFormat = '24h';

const timeFormats: Record<ClockFormat, Intl.DateTimeFormat> = {
	'24h': new Intl.DateTimeFormat('en-GB', {
		timeZone: TIME_ZONE,
		hourCycle: 'h23',
		hour: '2-digit',
		minute: '2-digit'
	}),
	'12h': new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hourCycle: 'h12', hour: 'numeric', minute: '2-digit' })
};

export function dayKey(date: Date): DayKey {
	return keyFormat.format(date);
}

// Day arithmetic happens at noon UTC so clock changes can never move a key.
function noonUtc(key: DayKey): Date {
	return new Date(`${key}T12:00:00Z`);
}

export function addDays(key: DayKey, days: number): DayKey {
	const date = noonUtc(key);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** 0 for Monday through 6 for Sunday. */
export function weekday(key: DayKey): number {
	return (noonUtc(key).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: DayKey): DayKey {
	return addDays(key, -weekday(key));
}

/** The instant that a UK wall-clock time (`HH:mm`) on a given day refers to. */
export function ukTime(key: DayKey, hhmm: string): Date {
	const [year, month, day] = key.split('-').map(Number) as [number, number, number];
	const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
	const guess = Date.UTC(year, month - 1, day, hour, minute);
	const parts = Object.fromEntries(partsFormat.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
	const shown = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute)
	);
	return new Date(guess - (shown - guess));
}

/**
 * For example "15:04", or "3:04 pm" in the 12-hour format. Left at 24 hours, it's also the Hub's `HH:mm` for comparing
 * times, so only pass a format when showing the time to people.
 */
export function formatTime(date: Date, format: ClockFormat = '24h'): string {
	return timeFormats[format].format(date);
}

export function formatWeekday(key: DayKey, style: 'long' | 'short'): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: style }).format(noonUtc(key));
}

/** For example "21 October". */
export function formatDayMonth(key: DayKey): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(noonUtc(key));
}

export function dayOfMonth(key: DayKey): number {
	return Number(key.slice(8));
}

/**
 * How long from one time to another, for example "under a minute", "45 min", "2 h 15 min" or "3 days 4 h". Past a
 * day, minutes are left out.
 */
export function formatDuration(from: Date, to: Date): string {
	const minutes = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
	if (minutes < 1) return 'under a minute';
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
	const days = Math.floor(hours / 24);
	const dayText = `${days} ${days === 1 ? 'day' : 'days'}`;
	return hours % 24 === 0 ? dayText : `${dayText} ${hours % 24} h`;
}

/** For example "in 27 min" or "in 1 h 49 min". */
export function formatIn(from: Date, to: Date): string {
	const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
	if (minutes < 60) return `in ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
}
