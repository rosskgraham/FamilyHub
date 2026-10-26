import type { CalendarEvent } from '#lib/calendar.ts';
import type { DayKey } from '#lib/time.ts';

export interface CalendarSource {
	/** Events that touch any day from `from` up to, but not including, `to`. */
	listEvents(from: DayKey, to: DayKey): Promise<CalendarEvent[]>;
}
