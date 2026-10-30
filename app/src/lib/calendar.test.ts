import { describe, expect, it } from 'vitest';
import { eventsOn, nextEvent, type CalendarEvent } from './calendar.ts';

const timed = (id: string, start: string, end: string): CalendarEvent => ({
	id,
	title: id,
	owner: 'alex',
	allDay: false,
	start,
	end
});
const allDay = (id: string, start: string, end: string): CalendarEvent => ({ ...timed(id, start, end), allDay: true });

describe('eventsOn', () => {
	it('includes every day an all-day Event covers, but not its end day', () => {
		const holiday = allDay('holiday', '2026-10-26', '2026-10-29');
		expect(eventsOn([holiday], '2026-10-26').allDay).toEqual([holiday]);
		expect(eventsOn([holiday], '2026-10-28').allDay).toEqual([holiday]);
		expect(eventsOn([holiday], '2026-10-29').allDay).toEqual([]);
	});

	it('puts a timed Event on its UK day, not its UTC day', () => {
		// 00:30 on 2 July in the UK is 23:30 on 1 July in UTC.
		const late = timed('late', '2026-07-01T23:30:00.000Z', '2026-07-02T00:30:00.000Z');
		expect(eventsOn([late], '2026-07-02').timed).toEqual([late]);
		expect(eventsOn([late], '2026-07-01').timed).toEqual([]);
	});

	it('sorts timed Events by start', () => {
		const lunch = timed('lunch', '2026-10-28T12:00:00.000Z', '2026-10-28T13:00:00.000Z');
		const breakfast = timed('breakfast', '2026-10-28T08:00:00.000Z', '2026-10-28T09:00:00.000Z');
		expect(eventsOn([lunch, breakfast], '2026-10-28').timed).toEqual([breakfast, lunch]);
	});
});

describe('nextEvent', () => {
	const lunch = timed('lunch', '2026-10-28T12:00:00.000Z', '2026-10-28T13:00:00.000Z');
	const run = timed('run', '2026-10-29T07:00:00.000Z', '2026-10-29T08:00:00.000Z');
	const bins = allDay('bins', '2026-10-29', '2026-10-30');

	it('is the first timed Event still to start, whatever the order', () => {
		expect(nextEvent([run, bins, lunch], new Date('2026-10-28T08:00:00Z'))).toBe(lunch);
		expect(nextEvent([run, bins, lunch], new Date('2026-10-28T23:00:00Z'))).toBe(run);
	});

	it('skips an Event that has started, and all-day Events', () => {
		expect(nextEvent([lunch, bins], new Date('2026-10-28T12:30:00Z'))).toBeUndefined();
	});
});
