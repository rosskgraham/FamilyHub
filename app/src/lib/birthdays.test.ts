import { describe, expect, it } from 'vitest';
import { asBirthday } from './birthdays.ts';
import type { CalendarEvent } from './calendar.ts';

const event: CalendarEvent = { id: 'e1', title: 'Gran’s birthday', owner: 'alex', allDay: true, start: '2026-10-30', end: '2026-10-31' };

describe('asBirthday', () => {
	it('shows a birthday as the Household’s, with a cake, keeping its title', () => {
		expect(asBirthday(event)).toEqual({ ...event, owner: 'everyone', birthday: true });
	});

	it('shows one with a time all day on its UK day', () => {
		const timed = { ...event, allDay: false, start: '2026-07-01T23:30:00.000Z', end: '2026-07-02T00:30:00.000Z' };
		expect(asBirthday(timed)).toMatchObject({ allDay: true, start: '2026-07-02', end: '2026-07-03', birthday: true });
	});
});
