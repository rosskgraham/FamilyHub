import { CALENDAR_SOURCE } from '$app/env/private';
import type { CalendarEvent, CalendarStatus } from '#lib/calendar.ts';
import { sampleHousehold, type Household } from '#lib/household.ts';
import { dayKey, type DayKey } from '#lib/time.ts';
import { isConfigured, isSignedIn, SignInNeeded } from '../google/auth.ts';
import { configuredHousehold } from '../household.ts';
import { readSettings } from '../settings.ts';
import { fromCache, readCache, saveRange } from './cache.ts';
import { fakeCalendar } from './fake.ts';
import { googleCalendar } from './google.ts';

export interface CalendarResult {
	events: CalendarEvent[];
	status: CalendarStatus;
	/** Who the Events belong to: the made-up Household for sample Events. */
	household: Household;
}

/**
 * Events from Google once the Hub is signed in and set up, otherwise sample Events.
 * Set CALENDAR_SOURCE=sample to force sample Events.
 */
export async function loadCalendar(from: DayKey, to: DayKey): Promise<CalendarResult> {
	const { household } = await configuredHousehold();
	// Calendars chosen for someone no longer in the Household are left out.
	const calendars = Object.fromEntries(
		Object.entries((await readSettings()).calendars).filter(([owner]) => owner in household)
	);
	const setUp = isConfigured() && Object.keys(calendars).length > 0 && (await isSignedIn());
	if (CALENDAR_SOURCE === 'sample' || !setUp) {
		return {
			events: await fakeCalendar.listEvents(from, to),
			status: { kind: 'sample', setUp },
			household: sampleHousehold
		};
	}

	try {
		const events = await googleCalendar(calendars).listEvents(from, to);
		const at = new Date().toISOString();
		await saveRange(from, to, events, at, dayKey(new Date()));
		return { events, status: { kind: 'live', updatedAt: at }, household };
	} catch (e) {
		const reason = e instanceof SignInNeeded ? 'sign-in' : 'offline';
		if (reason === 'offline') console.error('Calendar sync failed:', e);
		// The last good answer, shown if Google can't be reached.
		const last = fromCache(await readCache(), from, to);
		return {
			events: last.events,
			status: { kind: 'stale', reason, updatedAt: last.at },
			household
		};
	}
}
