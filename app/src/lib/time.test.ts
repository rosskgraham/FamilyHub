import { describe, expect, it } from 'vitest';
import { addDays, dayKey, formatIn, startOfWeek, ukTime, weekday } from './time.ts';

// British Summer Time ends at 01:00 UTC on Sunday 25 October 2026.

describe('dayKey', () => {
	it('uses the UK day, not the UTC one, during summer time', () => {
		expect(dayKey(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
	});

	it('matches UTC in winter', () => {
		expect(dayKey(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01');
	});
});

describe('ukTime', () => {
	it('is an hour behind UTC in summer', () => {
		expect(ukTime('2026-07-01', '09:00').toISOString()).toBe('2026-07-01T08:00:00.000Z');
	});

	it('matches UTC in winter', () => {
		expect(ukTime('2026-12-01', '09:00').toISOString()).toBe('2026-12-01T09:00:00.000Z');
	});

	it('handles the days either side of the clocks going back', () => {
		expect(ukTime('2026-10-25', '00:00').toISOString()).toBe('2026-10-24T23:00:00.000Z');
		expect(ukTime('2026-10-26', '00:00').toISOString()).toBe('2026-10-26T00:00:00.000Z');
	});
});

describe('addDays', () => {
	it('crosses months, years and clock changes', () => {
		expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
});

describe('weeks', () => {
	it('start on Monday', () => {
		expect(weekday('2026-10-26')).toBe(0);
		expect(weekday('2026-11-01')).toBe(6);
		expect(startOfWeek('2026-11-01')).toBe('2026-10-26');
		expect(startOfWeek('2026-10-26')).toBe('2026-10-26');
	});
});

describe('formatIn', () => {
	const from = new Date('2026-10-28T09:00:00Z');
	const after = (minutes: number) => new Date(from.getTime() + minutes * 60_000);

	it('counts minutes under an hour', () => {
		expect(formatIn(from, after(27))).toBe('in 27 min');
	});

	it('counts hours and minutes', () => {
		expect(formatIn(from, after(109))).toBe('in 1 h 49 min');
		expect(formatIn(from, after(120))).toBe('in 2 h');
	});

	it('never counts backwards', () => {
		expect(formatIn(from, after(-5))).toBe('in 0 min');
	});
});
