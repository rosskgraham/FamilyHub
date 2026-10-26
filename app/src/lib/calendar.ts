import type { OwnerId } from './household.ts';
import { dayKey, type DayKey } from './time.ts';

export interface CalendarEvent {
	id: string;
	title: string;
	owner: OwnerId;
	allDay: boolean;
	/** An ISO instant for a timed Event; a DayKey for an all-day one. */
	start: string;
	/** An ISO instant for a timed Event; the DayKey after the last day for an all-day one. */
	end: string;
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
