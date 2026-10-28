import { loadCalendar } from '#lib/server/calendar/index.ts';
import { loadShopping } from '#lib/server/shopping/index.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// Today plus the four days the "Coming up" row shows.
const DAYS = 5;

export const load: PageServerLoad = async () => {
	const today = dayKey(new Date());
	const [calendar, shopping] = await Promise.all([loadCalendar(today, addDays(today, DAYS)), loadShopping()]);
	return { today, events: calendar.events, calendarStatus: calendar.status, owners: calendar.household, shopping };
};
