// The last Events Google sent for each range of days, kept on the Hub's disk so they still show
// when Google can't be reached, even after a restart or once the day has moved on.
import type { CalendarEvent } from '#lib/calendar.ts';
import { addDays, ukTime, type DayKey } from '#lib/time.ts';
import { readJson, writeJson } from '../store.ts';

/** Keyed by `from/to`. */
export type CalendarCache = Record<string, { events: CalendarEvent[]; at: string }>;

const CACHE_FILE = 'calendar-cache.json';
// A range that ended this long ago is no use to any view.
const KEEP_DAYS = 7;
const REWRITE_MS = 60 * 60_000;

function touches(e: CalendarEvent, from: DayKey, to: DayKey): boolean {
	if (e.allDay) return e.start < to && e.end > from;
	return new Date(e.start) < ukTime(to, '00:00') && new Date(e.end) > ukTime(from, '00:00');
}

/**
 * What the cache knows about a range: its own Events if it was ever loaded, otherwise whatever the
 * ranges overlapping it held. Days no range covered are simply missing. `at` is the oldest of the
 * answers used, so the Hub never claims to be fresher than it is.
 */
export function fromCache(cache: CalendarCache, from: DayKey, to: DayKey): { events: CalendarEvent[]; at: string | null } {
	const exact = cache[`${from}/${to}`];
	if (exact) return exact;
	const used = Object.entries(cache)
		.filter(([range]) => {
			const [f, t] = range.split('/') as [DayKey, DayKey];
			return f < to && t > from;
		})
		// Newest first, so an Event's latest version wins.
		.map(([, entry]) => entry)
		.sort((a, b) => b.at.localeCompare(a.at));
	if (used.length === 0) return { events: [], at: null };
	const seen = new Map<string, CalendarEvent>();
	for (const { events } of used) {
		for (const e of events) {
			const key = `${e.id}@${e.start}`;
			if (!seen.has(key) && touches(e, from, to)) seen.set(key, e);
		}
	}
	return { events: [...seen.values()], at: used.at(-1)!.at };
}

/** The cache with a fresh answer for one range, less any range that ended a week ago. */
export function remember(cache: CalendarCache, from: DayKey, to: DayKey, events: CalendarEvent[], at: string, today: DayKey): CalendarCache {
	const oldest = addDays(today, -KEEP_DAYS);
	const kept = Object.entries(cache).filter(([range]) => range.split('/')[1]! >= oldest);
	return Object.fromEntries([...kept, [`${from}/${to}`, { events, at }]]);
}

let cache: CalendarCache | undefined;
let written = 0;

export async function readCache(): Promise<CalendarCache> {
	cache ??= (await readJson<CalendarCache>(CACHE_FILE)) ?? {};
	return cache;
}

export async function saveRange(from: DayKey, to: DayKey, events: CalendarEvent[], at: string, today: DayKey): Promise<void> {
	const before = await readCache();
	const changed = JSON.stringify(before[`${from}/${to}`]?.events) !== JSON.stringify(events);
	cache = remember(before, from, to, events, at, today);
	// When something changes, and otherwise hourly to keep the times fresh: every minute would wear out the Pi's SD card.
	if (changed || Date.now() - written > REWRITE_MS) {
		await writeJson(CACHE_FILE, cache);
		written = Date.now();
	}
}
