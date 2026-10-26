import { sampleShopping } from '#lib/sample.ts';
import { loadCalendar } from '#lib/server/calendar/index.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// Today plus the four days the "Coming up" row shows.
const DAYS = 5;

export const load: PageServerLoad = async () => {
	const today = dayKey(new Date());
	const { events, status } = await loadCalendar(today, addDays(today, DAYS));
	return { today, events, calendarStatus: status, shopping: sampleShopping };
};
