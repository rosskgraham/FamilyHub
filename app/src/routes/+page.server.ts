import { sampleShopping } from '#lib/sample.ts';
import { calendar } from '#lib/server/calendar/index.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// Today plus the four days the "Coming up" row shows.
const DAYS = 5;

export const load: PageServerLoad = async () => {
	const today = dayKey(new Date());
	return {
		today,
		events: await calendar.listEvents(today, addDays(today, DAYS)),
		shopping: sampleShopping
	};
};
