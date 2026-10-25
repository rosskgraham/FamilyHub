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
