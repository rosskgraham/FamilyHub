import { loadCalendar } from '#lib/server/calendar/index.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// `?date=2026-10-28` shows that day; without it, today.
export const load: PageServerLoad = async ({ url }) => {
	const today = dayKey(new Date());
	const requested = url.searchParams.get('date') ?? '';
	const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested)) ? requested : today;
	const { events, status } = await loadCalendar(date, addDays(date, 1));
	return { today, date, events, calendarStatus: status };
};
