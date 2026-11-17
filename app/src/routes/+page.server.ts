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
	const [calendar, , todos, energy] = await Promise.all([
		loadCalendar(today, addDays(today, DAYS)),
		// Not shown on the Today view, but a list only syncs when it's read: this sends changes queued while offline,
		// and keeps the failure alert working, while the Hub sits on the Today view.
		loadShopping(),
		loadTodos(),
		loadEnergy()
	]);
	return {
		today,
		events: calendar.events,
		owners: calendar.household,
		todos,
		energy: {
			rates: energy.tariff?.rates ?? null,
			slots: energy.slots,
			live: energy.live,
			charge: energy.charge,
			today: energy.today,
			needsRoss: energy.needsRoss
		}
	};
};
