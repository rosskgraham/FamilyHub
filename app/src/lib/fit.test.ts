import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from './calendar.ts';
import { fitColumn, type Space } from './fit.ts';

// Room for 2 cards (2 × 110) or 5 rows (5 × 44).
const space: Space = { height: 220, gap: 4, card: 106, row: 40 };

const event = (hour: number): CalendarEvent => ({
	id: `e${hour}`,
	title: `Event at ${hour}`,
	owner: 'alex',
	allDay: false,
	start: `2026-12-01T${String(hour).padStart(2, '0')}:00:00.000Z`,
	end: `2026-12-01T${String(hour).padStart(2, '0')}:30:00.000Z`
});
const events = (...hours: number[]) => hours.map(event);
const binDay: CalendarEvent = { ...event(0), id: 'bins', allDay: true, start: '2026-12-01', end: '2026-12-02' };

describe('fitColumn', () => {
	it('shows full cards when they all fit', () => {
		const fit = fitColumn({ allDay: [], timed: events(9, 10) }, space);
		expect(fit).toMatchObject({ compact: false, earlier: 0, more: 0 });
		expect(fit.timed).toHaveLength(2);
	});

	it('switches to rows when cards would not fit', () => {
		const fit = fitColumn({ allDay: [binDay], timed: events(9, 10, 11, 12) }, space);
		expect(fit).toMatchObject({ compact: true, earlier: 0, more: 0 });
		expect(fit.allDay).toEqual([binDay]);
		expect(fit.timed).toHaveLength(4);
	});

	it('folds finished Events into one "earlier" line', () => {
		const now = new Date('2026-12-01T12:00:00Z');
		const fit = fitColumn({ allDay: [], timed: events(8, 9, 10, 11, 13, 14) }, space, now);
		expect(fit).toMatchObject({ compact: true, earlier: 4, more: 0 });
		expect(fit.timed.map((e) => e.id)).toEqual(['e13', 'e14']);
	});

	it('counts what still does not fit behind "+N more", and never drops anything silently', () => {
		const timed = events(8, 9, 10, 11, 12, 13, 14, 15);
		const fit = fitColumn({ allDay: [binDay], timed }, space);
		expect(fit.compact).toBe(true);
		// 5 rows: 4 Events and the "+N more" line.
		expect(fit.allDay.length + fit.timed.length).toBe(4);
		expect(fit.allDay.length + fit.timed.length + fit.more).toBe(1 + timed.length);
	});

	it('only uses rows for a column without cards', () => {
		const fit = fitColumn({ allDay: [], timed: events(9) }, { ...space, card: undefined });
		expect(fit.compact).toBe(true);
	});
});
