import { loadCalendar } from '#lib/server/calendar/index.ts';
import { loadEnergy } from '#lib/server/energy/index.ts';
import { loadShopping } from '#lib/server/shopping/index.ts';
import { now } from '#lib/server/now.ts';
import { loadTodos } from '#lib/server/todos/index.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// Today plus the four days the "Coming up" row shows.
const DAYS = 5;

export const load: PageServerLoad = async () => {
	const today = dayKey(now());
	const [calendar, shopping, todos, energy] = await Promise.all([
		loadCalendar(today, addDays(today, DAYS)),
		loadShopping(),
		loadTodos(),
		loadEnergy()
	]);
	return {
		today,
		events: calendar.events,
		calendarStatus: calendar.status,
		owners: calendar.household,
		shopping,
		todos,
		energy: {
			rates: energy.tariff?.rates ?? null,
			slots: energy.slots,
			live: energy.live,
			today: energy.today,
			needsAlex: energy.needsAlex
		}
	};
};
