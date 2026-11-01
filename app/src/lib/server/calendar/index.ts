import { CALENDAR_SOURCE } from '$app/env/private';
import { asBirthday } from '#lib/birthdays.ts';
import type { CalendarEvent, CalendarStatus } from '#lib/calendar.ts';
import { EVERYONE, sampleHousehold, type Household } from '#lib/household.ts';
import { addDays, dayKey, startOfWeek, type DayKey } from '#lib/time.ts';
import { isConfigured, isSignedIn, SignInNeeded } from '../google/auth.ts';
import { configuredHousehold } from '../household.ts';
import { orElse } from '../fallback.ts';
import { readSettings } from '../settings.ts';
import { createSync, type Sync } from '../sync.ts';
import { fromCache, readCache, saveRange, touches } from './cache.ts';
import { fakeCalendar } from './fake.ts';
import { googleCalendar } from './google.ts';
import type { CalendarSource } from './source.ts';

export interface CalendarResult {
	events: CalendarEvent[];
	status: CalendarStatus;
	/** Who the Events belong to: the made-up Household for sample Events. */
	household: Household;
}

// Events change on phones, so this is how soon they reach the wall.
const REFRESH_MS = 2 * 60_000;
// This week and next: every view the Hub shows by itself, and the Week and Day views near today.
const WINDOW_DAYS = 14;

let windowSync: { key: string; from: DayKey; to: DayKey; events: Sync<CalendarEvent[]> } | undefined;

/** The chosen Calendars, and the Birthdays calendar if there is one, its Events shown as birthdays. */
function chosenCalendars(calendars: Record<string, string>, birthdays: string | undefined): CalendarSource {
	return {
		async listEvents(from, to) {
			const [events, birthdayEvents] = await Promise.all([
				googleCalendar(calendars).listEvents(from, to),
				birthdays ? googleCalendar({ [EVERYONE]: birthdays }).listEvents(from, to) : []
			]);
			return [...events, ...birthdayEvents.map(asBirthday)];
		}
	};
}

/** The background sync for the Calendars' window of days, started again when the week or the chosen Calendars change. */
function eventsSync(calendars: Record<string, string>, birthdays: string | undefined, today: DayKey) {
	const from = startOfWeek(today);
	const to = addDays(from, WINDOW_DAYS);
	const key = `${from}|${JSON.stringify(calendars)}|${birthdays}`;
	if (windowSync?.key !== key) {
		const source = chosenCalendars(calendars, birthdays);
		const events = createSync({
			name: 'Calendar',
			fetch: () => source.listEvents(from, to),
			everyMs: REFRESH_MS,
			load: async () => {
				const last = fromCache(await readCache(), from, to);
				return last.at ? { value: last.events, at: last.at } : null;
			},
			save: (k) => saveRange(from, to, k.value, k.at, dayKey(new Date()))
		});
		windowSync = { key, from, to, events };
	}
	return windowSync;
}

/**
 * Events from Google once the Hub is signed in and set up, otherwise sample Events.
 * Set CALENDAR_SOURCE=sample to force sample Events. Days near today come from the background sync at once; others are
 * asked for there and then.
 */
export function loadCalendar(from: DayKey, to: DayKey): Promise<CalendarResult> {
	return orElse('Calendar', () => loadEvents(from, to), {
		events: [],
		status: { kind: 'stale', reason: 'offline', updatedAt: null },
		// With no Events, whose they would be doesn't matter.
		household: sampleHousehold
	});
}

async function loadEvents(from: DayKey, to: DayKey): Promise<CalendarResult> {
	const { household } = await configuredHousehold();
	// Calendars chosen for someone no longer in the Household are left out.
	const settings = await readSettings();
	const calendars = Object.fromEntries(Object.entries(settings.calendars).filter(([owner]) => owner in household));
	const setUp = isConfigured() && Object.keys(calendars).length > 0 && (await isSignedIn());
	if (CALENDAR_SOURCE === 'sample' || !setUp) {
		return {
			events: await fakeCalendar.listEvents(from, to),
			status: { kind: 'sample', setUp },
			household: sampleHousehold
		};
	}

	const window = eventsSync(calendars, settings.birthdays, dayKey(new Date()));
	if (window.from <= from && to <= window.to) {
		const { value, at, error } = await window.events.read();
		const events = (value ?? []).filter((e) => touches(e, from, to));
		if (!error && at) return { events, status: { kind: 'live', updatedAt: at }, household };
		const reason = error instanceof SignInNeeded ? 'sign-in' : 'offline';
		return { events, status: { kind: 'stale', reason, updatedAt: at }, household };
	}

	try {
		const events = await chosenCalendars(calendars, settings.birthdays).listEvents(from, to);
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
