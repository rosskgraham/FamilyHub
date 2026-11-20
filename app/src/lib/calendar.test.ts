import { describe, expect, it } from 'vitest';
import { eventsOn, eventWhen, nextEvent, type CalendarEvent } from './calendar.ts';

const timed = (id: string, start: string, end: string): CalendarEvent => ({
	id,
	title: id,
	owner: 'ross',
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

describe('eventWhen', () => {
	const event = (allDay: boolean, start: string, end: string): CalendarEvent => ({
		id: 'e',
		title: 'Event',
		owner: 'ross',
		allDay,
		start,
		end
	});

	it('gives a timed Event its UK day and times', () => {
		// 4 July 2026 is in summer time, so 08:00 UTC is 09:00 in the UK.
		expect(eventWhen(event(false, '2026-07-04T08:00:00Z', '2026-07-04T09:30:00Z'))).toEqual({
			day: 'Saturday 4 July',
			time: '09:00–10:30'
		});
	});

	it('uses the clock format chosen in Settings', () => {
		expect(eventWhen(event(false, '2026-11-20T15:00:00Z', '2026-11-20T16:00:00Z'), '12h').time).toBe('3:00 pm–4:00 pm');
	});

	it('keeps an Event ending at midnight on its own day', () => {
		expect(eventWhen(event(false, '2026-11-20T22:00:00Z', '2026-11-21T00:00:00Z')).day).toBe('Friday 20 November');
	});

	it('gives both days for a timed Event past midnight', () => {
		expect(eventWhen(event(false, '2026-11-20T22:00:00Z', '2026-11-21T02:00:00Z'))).toEqual({
			day: 'Friday 20 November – Saturday 21 November',
			time: '22:00–02:00'
		});
	});

	it('says all day, with the last day for a longer one', () => {
		expect(eventWhen(event(true, '2026-11-20', '2026-11-21'))).toEqual({ day: 'Friday 20 November', time: 'All day' });
		expect(eventWhen(event(true, '2026-11-20', '2026-11-23')).day).toBe('Friday 20 November – Sunday 22 November');
	});
});
