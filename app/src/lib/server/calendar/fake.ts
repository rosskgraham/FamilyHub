import type { CalendarEvent } from '#lib/calendar.ts';
import type { OwnerId } from '#lib/household.ts';
import { addDays, ukTime, weekday, type DayKey } from '#lib/time.ts';
import type { CalendarSource } from './source.ts';

// A typical week, from the mockups, repeated for every week asked for.
// A null time is an all-day Event.
type Template = [time: string | null, title: string, owner: OwnerId];

const typicalWeek: Template[][] = [
	[['16:00', 'Swimming', 'maya'], ['18:30', 'Cubs', 'leo']],
	[['09:00', 'Team offsite', 'alex'], ['17:30', 'Football training', 'leo']],
	[
		['07:45', 'School run', 'sam'],
		['10:00', 'Boiler service', 'sam'],
		['16:30', 'Piano lesson', 'maya'],
		['19:00', 'Book club', 'sam']
	],
	[[null, 'Bin day', 'everyone'], ['17:00', 'Swimming', 'maya'], ['18:00', 'Five-a-side', 'alex']],
	[['15:30', 'Dentist', 'leo'], ['19:30', 'Takeaway night', 'everyone']],
	// A busy Saturday, more than a Week view column holds, to show the overflow.
	[
		['08:00', 'Parkrun', 'alex'],
		['09:00', 'Swimming lesson', 'maya'],
		['09:30', 'Football match', 'leo'],
		['10:30', 'Haircut', 'sam'],
		['11:00', 'Big shop', 'everyone'],
		['12:30', 'Drama club', 'maya'],
		['13:00', 'Car to the garage', 'alex'],
		['14:00', 'Birthday party', 'maya'],
		['15:00', 'Coffee with Sarah', 'sam'],
		['16:30', 'Collect Maya', 'sam'],
		['17:00', 'Gaming with Jack', 'leo'],
		['19:00', 'Date night', 'alex']
	],
	[['12:30', 'Lunch at Gran’s', 'everyone'], ['16:00', 'Garden tidy', 'sam']]
];

export const fakeCalendar: CalendarSource = {
	async listEvents(from, to) {
		const events: CalendarEvent[] = [];
		for (let key: DayKey = from; key < to; key = addDays(key, 1)) {
			typicalWeek[weekday(key)]!.forEach(([time, title, owner], i) => {
				const id = `fake-${key}-${i}`;
				if (time === null) {
					events.push({ id, title, owner, allDay: true, start: key, end: addDays(key, 1) });
				} else {
					const start = ukTime(key, time);
					const end = new Date(start.getTime() + 60 * 60_000);
					events.push({ id, title, owner, allDay: false, start: start.toISOString(), end: end.toISOString() });
				}
			});
		}
		return events;
	}
};
