import type { CalendarEvent } from '#lib/calendar.ts';
import type { OwnerId } from '#lib/household.ts';
import { ukTime } from '#lib/time.ts';
import { googleGet } from '../google/auth.ts';
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

interface GoogleTime {
	date?: string;
	dateTime?: string;
}

interface EventsResponse {
	items: {
		id: string;
		iCalUID?: string;
		status?: string;
		summary?: string;
		start: GoogleTime;
		end: GoogleTime;
		attendees?: { self?: boolean; responseStatus?: string }[];
	}[];
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
						for (const item of response.items) {
							if (item.status === 'cancelled') continue;
							if (item.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue;
							const allDay = item.start.date !== undefined;
							events.push({
								id: item.iCalUID ?? item.id,
								title: item.summary ?? '(No title)',
								owner,
								allDay,
								start: allDay ? item.start.date! : new Date(item.start.dateTime!).toISOString(),
								end: allDay ? item.end.date! : new Date(item.end.dateTime!).toISOString()
							});
						}
						pageToken = response.nextPageToken;
					} while (pageToken);
					return events;
				})
			);
			// An Event on two Calendars (one person invited to a Family event) shows once,
			// under whichever owner was read first.
			const seen = new Set<string>();
			return perCalendar.flat().filter((e) => {
				const key = `${e.id}@${e.start}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		}
	};
}
