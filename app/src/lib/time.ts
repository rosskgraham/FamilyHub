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

const timeFormat = new Intl.DateTimeFormat('en-GB', {
	timeZone: TIME_ZONE,
	hourCycle: 'h23',
	hour: '2-digit',
	minute: '2-digit'
});

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
	const parts = Object.fromEntries(
		partsFormat.formatToParts(new Date(guess)).map((part) => [part.type, part.value])
	);
	const shown = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute)
	);
	return new Date(guess - (shown - guess));
}

export function formatTime(date: Date): string {
	return timeFormat.format(date);
}

export function formatWeekday(key: DayKey, style: 'long' | 'short'): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: style }).format(noonUtc(key));
}

/** For example "21 October". */
export function formatDayMonth(key: DayKey): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(
		noonUtc(key)
	);
}

export function dayOfMonth(key: DayKey): number {
	return Number(key.slice(8));
}

/** For example "in 27 min" or "in 1 h 49 min". */
export function formatIn(from: Date, to: Date): string {
	const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
	if (minutes < 60) return `in ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
}
