import type { CalendarEvent } from '#lib/calendar.ts';
import type { OwnerId } from '#lib/household.ts';
import { ukTime } from '#lib/time.ts';
import { googleGet } from '../google/auth.ts';
import { toEvents, withoutDuplicates, type GoogleEvent } from './from-google.ts';
import type { CalendarSource } from './source.ts';

const API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendar {
	id: string;
	summary: string;
	primary: boolean;
}

interface CalendarListResponse {
	items: { id: string; summary: string; summaryOverride?: string; primary?: boolean }[];
}

interface EventsResponse {
	items: GoogleEvent[];
	nextPageToken?: string;
}

export async function listCalendars(): Promise<GoogleCalendar[]> {
	const response = await googleGet<CalendarListResponse>(`${API}/users/me/calendarList`);
	return response.items.map((c) => ({
		id: c.id,
		summary: c.summaryOverride ?? c.summary,
		primary: c.primary ?? false
	}));
}

/** Reads the Calendars mapped to each owner. */
export function googleCalendar(calendars: Record<OwnerId, string>): CalendarSource {
	return {
		async listEvents(from, to) {
			const timeMin = ukTime(from, '00:00').toISOString();
			const timeMax = ukTime(to, '00:00').toISOString();
			const perCalendar = await Promise.all(
				Object.entries(calendars).map(async ([owner, calendarId]) => {
					const events: CalendarEvent[] = [];
					let pageToken: string | undefined;
					do {
						const params = new URLSearchParams({
							timeMin,
							timeMax,
							singleEvents: 'true',
							orderBy: 'startTime',
							maxResults: '250'
						});
						if (pageToken) params.set('pageToken', pageToken);
						const response = await googleGet<EventsResponse>(
							`${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
						);
						events.push(...toEvents(response.items, owner));
						pageToken = response.nextPageToken;
					} while (pageToken);
					return events;
				})
			);
			return withoutDuplicates(perCalendar.flat());
		}
	};
}
