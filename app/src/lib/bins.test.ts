import { describe, expect, it } from 'vitest';
import { asBinDay } from './bins.ts';
import type { CalendarEvent } from './calendar.ts';

const allDay = (title: string): CalendarEvent => ({
	id: 'e1',
	title,
	owner: 'alex',
	allDay: true,
	start: '2026-10-29',
	end: '2026-10-30'
});

describe('asBinDay', () => {
	it.each([
		['Blue bin collection day', 'Blue bin', 'blue'],
		['Grey bin collection day', 'Grey bin', 'grey'],
		['Brown bin collection day', 'Brown bin', 'brown'],
		['Purple bin collection day', 'Purple bin', 'purple'],
		['  purple BIN collection Day ', 'Purple bin', 'purple'],
		['Gray bin collection day', 'Grey bin', 'grey']
	])('shows “%s” as the Household’s %s', (title, shown, bin) => {
		expect(asBinDay(allDay(title))).toEqual({ ...allDay(title), title: shown, owner: 'everyone', bin });
	});

	it.each(['Green bin collection day', 'Blue bin', 'Bin day', 'Take the blue bin collection day out'])(
		'leaves “%s” alone',
		(title) => {
			expect(asBinDay(allDay(title))).toEqual(allDay(title));
		}
	);

	it('leaves a timed Event alone, even with the name', () => {
		const timed = { ...allDay('Blue bin collection day'), allDay: false, start: '2026-10-29T07:00:00.000Z' };
		expect(asBinDay(timed)).toBe(timed);
	});
});
