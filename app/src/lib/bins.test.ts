import { describe, expect, it } from 'vitest';
import { asBinDay, takeBins } from './bins.ts';
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

	it('shows a timed bin day, as the council’s calendar sends them, as all day on its day', () => {
		const at = '2026-10-29T07:00:00.000Z';
		const timed = { ...allDay('Blue bin collection day'), allDay: false, start: at, end: at };
		expect(asBinDay(timed)).toEqual({ ...allDay('Blue bin'), owner: 'everyone', bin: 'blue' });
	});

	it('puts a timed bin day on its UK day, not its UTC one', () => {
		const at = '2026-07-01T23:30:00.000Z';
		const timed = { ...allDay('Grey bin collection day'), allDay: false, start: at, end: at };
		expect(asBinDay(timed)).toMatchObject({ allDay: true, start: '2026-07-02', end: '2026-07-03' });
	});
});

describe('takeBins', () => {
	it('takes bin days out of a day’s all-day Events, keeping their colours', () => {
		const bin = asBinDay(allDay('Blue bin collection day'));
		const birthday = { ...allDay('Grandad’s birthday'), id: 'e2' };
		const timed = { ...allDay('Swimming'), id: 'e3', allDay: false };
		expect(takeBins({ allDay: [bin, birthday], timed: [timed] })).toEqual({
			bins: ['blue'],
			day: { allDay: [birthday], timed: [timed] }
		});
	});
});
