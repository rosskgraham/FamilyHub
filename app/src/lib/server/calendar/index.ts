import { CALENDAR_SOURCE } from '$app/env/private';
import type { CalendarEvent, CalendarStatus } from '#lib/calendar.ts';
import type { DayKey } from '#lib/time.ts';
import { isConfigured, isSignedIn, SignInNeeded } from '../google/auth.ts';
import { readSettings } from '../settings.ts';
import { fakeCalendar } from './fake.ts';
import { googleCalendar } from './google.ts';

export interface CalendarResult {
	events: CalendarEvent[];
	status: CalendarStatus;
}

// The last good answer for each range, shown if Google can't be reached.
const lastGood = new Map<string, { events: CalendarEvent[]; at: string }>();

/**
 * Events from Google once the Hub is signed in and set up, otherwise sample Events.
 * Set CALENDAR_SOURCE=sample to force sample Events.
 */
export async function loadCalendar(from: DayKey, to: DayKey): Promise<CalendarResult> {
	const { calendars } = await readSettings();
	const setUp = isConfigured() && Object.keys(calendars).length > 0 && (await isSignedIn());
	if (CALENDAR_SOURCE === 'sample' || !setUp) {
		return { events: await fakeCalendar.listEvents(from, to), status: { kind: 'sample', setUp } };
	}

	const range = `${from}/${to}`;
	try {
		const events = await googleCalendar(calendars).listEvents(from, to);
		const at = new Date().toISOString();
		lastGood.set(range, { events, at });
		return { events, status: { kind: 'live', updatedAt: at } };
	} catch (e) {
		const reason = e instanceof SignInNeeded ? 'sign-in' : 'offline';
		if (reason === 'offline') console.error('Calendar sync failed:', e);
		const last = lastGood.get(range);
		return {
			events: last?.events ?? [],
			status: { kind: 'stale', reason, updatedAt: last?.at ?? null }
		};
	}
}
