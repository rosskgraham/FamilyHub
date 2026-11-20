import type { BinColour } from './bins.ts';
import type { OwnerId } from './household.ts';
import { addDays, dayKey, formatDayMonth, formatTime, formatWeekday, type ClockFormat, type DayKey } from './time.ts';

export interface CalendarEvent {
	id: string;
	title: string;
	owner: OwnerId;
	allDay: boolean;
	/** An ISO instant for a timed Event; a DayKey for an all-day one. */
	start: string;
	/** An ISO instant for a timed Event; the DayKey after the last day for an all-day one. */
	end: string;
	/** Set on a bin day, which shows a bin in this colour instead of a badge. */
	bin?: BinColour;
	/** Set on someone's birthday, which shows a cake instead of a badge. */
	birthday?: true;
}

/** The Event as all day: a timed one on its UK day, for Events where only the day matters, such as bin days. */
export function allDayOn(event: CalendarEvent): CalendarEvent {
	if (event.allDay) return event;
	const day = dayKey(new Date(event.start));
	return { ...event, allDay: true, start: day, end: addDays(day, 1) };
}

/** Where the Events on screen came from, and how fresh they are. */
export type CalendarStatus =
	| { kind: 'sample'; setUp: boolean }
	| { kind: 'live'; updatedAt: string }
	| { kind: 'stale'; reason: 'sign-in' | 'offline'; updatedAt: string | null };

export interface DayEvents {
	allDay: CalendarEvent[];
	timed: CalendarEvent[];
}

export function eventsOn(events: CalendarEvent[], key: DayKey): DayEvents {
	return {
		allDay: events.filter((e) => e.allDay && e.start <= key && key < e.end),
		timed: events
			.filter((e) => !e.allDay && dayKey(new Date(e.start)) === key)
			.sort((a, b) => a.start.localeCompare(b.start))
	};
}

/** The next timed Event to start after `now`, if any. */
export function nextEvent(events: CalendarEvent[], now: Date): CalendarEvent | undefined {
	return events.filter((e) => !e.allDay && new Date(e.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
}

const longDay = (key: DayKey) => `${formatWeekday(key, 'long')} ${formatDayMonth(key)}`;

/**
 * When an Event is, for tapping it: its day, or first and last days, and its times, such as "Saturday 31 October" and
 * "09:00–10:00", or "All day".
 */
export function eventWhen(event: CalendarEvent, format: ClockFormat = '24h'): { day: string; time: string } {
	const first = event.allDay ? event.start : dayKey(new Date(event.start));
	// An all-day Event ends on the day after its last; a timed one ending at midnight belongs to the day before.
	const last = event.allDay ? addDays(event.end, -1) : dayKey(new Date(new Date(event.end).getTime() - 1));
	const day = first === last ? longDay(first) : `${longDay(first)} – ${longDay(last)}`;
	if (event.allDay) return { day, time: 'All day' };
	return { day, time: `${formatTime(new Date(event.start), format)}–${formatTime(new Date(event.end), format)}` };
}
