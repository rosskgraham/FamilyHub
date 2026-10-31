import { loadCalendar } from '#lib/server/calendar/index.ts';
import { loadRates } from '#lib/server/energy/index.ts';
import { loadShopping } from '#lib/server/shopping/index.ts';
import { now } from '#lib/server/now.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// Today plus the four days the "Coming up" row shows.
const DAYS = 5;

export const load: PageServerLoad = async () => {
	const today = dayKey(now());
	const [calendar, shopping, energy] = await Promise.all([
		loadCalendar(today, addDays(today, DAYS)),
		loadShopping(),
		loadRates()
	]);
	return { today, events: calendar.events, calendarStatus: calendar.status, owners: calendar.household, shopping, rates: energy.rates };
};
