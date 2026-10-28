import type { CalendarEvent } from '#lib/calendar.ts';
import type { OwnerId } from '#lib/household.ts';

interface GoogleTime {
	date?: string;
	dateTime?: string;
}

export interface GoogleEvent {
	id: string;
	iCalUID?: string;
	status?: string;
	summary?: string;
	start: GoogleTime;
	end: GoogleTime;
	attendees?: { self?: boolean; responseStatus?: string }[];
}

/** One Calendar's Google events as Events for `owner`, leaving out cancelled and declined ones. */
export function toEvents(items: GoogleEvent[], owner: OwnerId): CalendarEvent[] {
	return items
		.filter((item) => item.status !== 'cancelled')
		.filter((item) => !item.attendees?.some((a) => a.self && a.responseStatus === 'declined'))
		.map((item): CalendarEvent => {
			const allDay = item.start.date !== undefined;
			return {
				id: item.iCalUID ?? item.id,
				title: item.summary ?? '(No title)',
				owner,
				allDay,
				start: allDay ? item.start.date! : new Date(item.start.dateTime!).toISOString(),
				end: allDay ? item.end.date! : new Date(item.end.dateTime!).toISOString()
			};
		});
}

/**
 * An Event on two Calendars (one person invited to a Family event) shows once,
 * under whichever owner comes first.
 */
export function withoutDuplicates(events: CalendarEvent[]): CalendarEvent[] {
	const seen = new Set<string>();
	return events.filter((e) => {
		const key = `${e.id}@${e.start}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
