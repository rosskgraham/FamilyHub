import { describe, expect, it } from 'vitest';
import { weekPage, weekTitle } from './week.ts';

describe('weekPage', () => {
	it('starts on today, whatever day of the week it is', () => {
		// Monday 23 November to Sunday 29 November 2026.
		for (const today of ['2026-11-23', '2026-11-25', '2026-11-28', '2026-11-29']) {
			const { offset, days } = weekPage(today, null);
			expect(offset).toBe(0);
			expect(days).toHaveLength(7);
			expect(days[0]).toBe(today);
		}
	});

	it('shows today and the next 6 days, across a month and a clock change', () => {
		expect(weekPage('2026-11-28', null).days).toEqual([
			'2026-11-28',
			'2026-11-29',
			'2026-11-30',
			'2026-12-01',
			'2026-12-02',
			'2026-12-03',
			'2026-12-04'
		]);
		expect(weekPage('2026-10-22', null).days.at(-1)).toBe('2026-10-28');
	});

	it('steps 7 days at a time from today', () => {
		expect(weekPage('2026-11-28', '1').days[0]).toBe('2026-12-05');
		expect(weekPage('2026-11-28', '-1').days[0]).toBe('2026-11-21');
	});

	it('keeps to a year either way, and ignores nonsense', () => {
		expect(weekPage('2026-11-28', '99').offset).toBe(52);
		expect(weekPage('2026-11-28', '-99').offset).toBe(-52);
		expect(weekPage('2026-11-28', 'soon')).toEqual(weekPage('2026-11-28', null));
	});
});

describe('weekTitle', () => {
	it('says how far from the next 7 days', () => {
		expect(weekTitle(0)).toBe('Next 7 days');
		expect(weekTitle(1)).toBe('In 1 week');
		expect(weekTitle(3)).toBe('In 3 weeks');
		expect(weekTitle(-1)).toBe('1 week ago');
		expect(weekTitle(-2)).toBe('2 weeks ago');
	});
});
