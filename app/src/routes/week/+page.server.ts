import { loadCalendar } from '#lib/server/calendar/index.ts';
import { now } from '#lib/server/now.ts';
import { addDays, dayKey, startOfWeek } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// `?week=1` is next week, `?week=-1` last week, up to a year either way.
const MAX_WEEKS = 52;

export const load: PageServerLoad = async ({ url }) => {
	const requested = Number.parseInt(url.searchParams.get('week') ?? '0', 10);
	const offset = Number.isNaN(requested) ? 0 : Math.max(-MAX_WEEKS, Math.min(MAX_WEEKS, requested));
	const today = dayKey(now());
	const monday = addDays(startOfWeek(today), offset * 7);
	const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
	const { events, status, household } = await loadCalendar(monday, addDays(monday, 7));
	return { today, offset, days, events, calendarStatus: status, owners: household };
};
