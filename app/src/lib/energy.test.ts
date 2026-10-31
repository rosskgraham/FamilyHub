import { describe, expect, it } from 'vitest';
import { cheapestWindow, formatLength, formatPence, formatWindow, priceBands, rateAt, type Rate } from './energy.ts';

/** Back-to-back Half-hours from `start`, one per price. */
function rates(start: string, prices: number[]): Rate[] {
	const t = new Date(start).getTime();
	return prices.map((pence, i) => ({
		from: new Date(t + i * 30 * 60_000).toISOString(),
		to: new Date(t + (i + 1) * 30 * 60_000).toISOString(),
		pence
	}));
}

describe('priceBands', () => {
	it('makes the cheapest quarter Cheap and the dearest quarter Peak', () => {
		const day = rates('2026-10-28T00:00:00Z', [10, 20, 30, 40, 50, 60, 70, 80]);
		expect(priceBands(day)).toEqual(['cheap', 'cheap', 'normal', 'normal', 'normal', 'normal', 'peak', 'peak']);
	});

	it('bands each UK day on its own', () => {
		// A cheap day then a dear one: each still has Cheap and Peak Half-hours.
		const two = [...rates('2026-10-28T00:00:00Z', [5, 6, 7, 8]), ...rates('2026-10-29T00:00:00Z', [30, 31, 32, 33])];
		expect(priceBands(two)).toEqual(['cheap', 'normal', 'normal', 'peak', 'cheap', 'normal', 'normal', 'peak']);
	});

	it('splits days at UK midnight, not UTC midnight', () => {
		// In summer time, 23:30 UTC is 00:30 the next UK day.
		const summer = rates('2026-06-21T22:00:00Z', [40, 10, 10, 10]);
		expect(priceBands(summer)).toEqual(['peak', 'cheap', 'cheap', 'peak']);
	});

	it('gives ties to the earlier Half-hour', () => {
		expect(priceBands(rates('2026-10-28T00:00:00Z', [9, 9, 9, 9]))).toEqual(['cheap', 'normal', 'normal', 'peak']);
	});
});

describe('rateAt', () => {
	const day = rates('2026-10-28T08:00:00Z', [24.2, 22.6]);

	it('finds the Half-hour a moment falls in', () => {
		expect(rateAt(day, new Date('2026-10-28T08:15:00Z'))?.pence).toBe(24.2);
		expect(rateAt(day, new Date('2026-10-28T08:30:00Z'))?.pence).toBe(22.6);
	});

	it('is undefined past the published rates', () => {
		expect(rateAt(day, new Date('2026-10-28T09:00:00Z'))).toBeUndefined();
	});
});

describe('cheapestWindow', () => {
	const day = rates('2026-10-28T08:00:00Z', [24, 20, 9, 8, 10, 30, 7, 30]);

	it('finds the run of Half-hours with the lowest average', () => {
		expect(cheapestWindow(day, new Date('2026-10-28T08:00:00Z'), 2)).toEqual({
			from: '2026-10-28T09:00:00.000Z',
			to: '2026-10-28T10:00:00.000Z',
			pence: 8.5
		});
	});

	it('never starts before now', () => {
		const window = cheapestWindow(day, new Date('2026-10-28T09:15:00Z'), 1);
		expect(window?.from).toBe('2026-10-28T11:00:00.000Z');
	});

	it('runs across midnight into tomorrow', () => {
		const late = rates('2026-10-28T22:00:00Z', [20, 20, 5, 5]);
		expect(cheapestWindow(late, new Date('2026-10-28T22:00:00Z'), 2)?.from).toBe('2026-10-28T23:00:00.000Z');
	});

	it('skips runs with a gap in the published rates', () => {
		const gappy = [...rates('2026-10-28T08:00:00Z', [20, 1]), ...rates('2026-10-28T10:00:00Z', [1, 20])];
		expect(cheapestWindow(gappy, new Date('2026-10-28T08:00:00Z'), 2)?.pence).toBe(10.5);
	});

	it('is null when the rates don’t stretch far enough', () => {
		expect(cheapestWindow(day, new Date('2026-10-28T11:00:00Z'), 3)).toBeNull();
	});

	it('prefers being paid to use electricity', () => {
		const negative = rates('2026-10-28T02:00:00Z', [3, -2.1, -1.4, 4]);
		expect(cheapestWindow(negative, new Date('2026-10-28T02:00:00Z'), 2)?.pence).toBe(-1.75);
	});
});

describe('formatting', () => {
	it.each([
		[24.24, '24.2p'],
		[8.96, '9.0p'],
		[-2.1, '−2.1p'],
		[0, '0.0p']
	])('shows %s as %s', (pence, shown) => {
		expect(formatPence(pence)).toBe(shown);
	});

	it.each([
		[1, '30 minutes'],
		[2, '1 hour'],
		[3, '1½ hours'],
		[4, '2 hours'],
		[6, '3 hours']
	])('shows %s Half-hours as %s', (halfHours, shown) => {
		expect(formatLength(halfHours)).toBe(shown);
	});

	it('says when a window is tomorrow', () => {
		const at = new Date('2026-10-28T17:00:00Z');
		expect(formatWindow({ from: '2026-10-28T13:00:00Z', to: '2026-10-28T15:00:00Z', pence: 9 }, at)).toBe('13:00–15:00');
		expect(formatWindow({ from: '2026-10-29T02:00:00Z', to: '2026-10-29T04:00:00Z', pence: 9 }, at)).toBe('02:00–04:00 tomorrow');
	});
});
