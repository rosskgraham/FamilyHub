import { loadCalendar } from '#lib/server/calendar/index.ts';
import { now } from '#lib/server/now.ts';
import { addDays, dayKey } from '#lib/time.ts';
import { weekPage } from '#lib/week.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const today = dayKey(now());
	const { offset, days } = weekPage(today, url.searchParams.get('week'));
	const { events, status, household } = await loadCalendar(days[0]!, addDays(days[0]!, 7));
	return { today, offset, days, events, calendarStatus: status, owners: household };
};
