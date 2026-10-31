import { describe, expect, it } from 'vitest';
import {
	bandAt,
	bestStart,
	cheapNow,
	cheapTimes,
	formatKw,
	formatLength,
	formatPence,
	formatPounds,
	formatStarts,
	halfHoursOf,
	rateAt,
	totals,
	type Slot
} from './energy.ts';

// 28 October 2026 is after the clocks went back, so UK time is UTC.
const at = (iso: string) => new Date(`2026-10-28T${iso}:00Z`);
const slot = (from: string, to: string): Slot => ({
	from: at(from).toISOString(),
	to: at(to).toISOString()
});
const afternoon = [slot('13:00', '14:30')];
const rates = { peak: 27.4, offPeak: 7.5 };

describe('bandAt', () => {
	it.each([
		['05:29', 'off-peak'],
		['05:30', 'peak'],
		['13:00', 'slot'],
		['14:29', 'slot'],
		['14:30', 'peak'],
		['23:29', 'peak'],
		['23:30', 'off-peak']
	])('at %s is %s', (time, band) => {
		expect(bandAt(at(time), afternoon)).toBe(band);
	});

	it('reads the Off-peak window in UK time, in summer time too', () => {
		// 23:30 BST is 22:30 UTC.
		expect(bandAt(new Date('2026-06-21T22:30:00Z'), [])).toBe('off-peak');
		expect(bandAt(new Date('2026-06-21T04:29:00Z'), [])).toBe('off-peak');
		expect(bandAt(new Date('2026-06-21T04:30:00Z'), [])).toBe('peak');
	});
});

describe('rateAt', () => {
	it('charges the Off-peak rate in a slot, and Peak otherwise', () => {
		expect(rateAt(at('13:30'), rates, afternoon)).toBe(7.5);
		expect(rateAt(at('15:00'), rates, afternoon)).toBe(27.4);
	});
});

describe('cheapTimes', () => {
	it('joins a slot that runs on from the Off-peak window', () => {
		const times = cheapTimes(at('00:00'), at('12:00'), [slot('05:30', '06:00')]);
		expect(times).toEqual([
			{
				from: '2026-10-27T23:30:00.000Z',
				to: '2026-10-28T06:00:00.000Z',
				slot: false
			}
		]);
	});

	it('keeps a slot on its own when it doesn’t touch the window', () => {
		const times = cheapTimes(at('08:15'), new Date('2026-10-29T12:00:00Z'), afternoon);
		expect(times).toEqual([
			{
				from: '2026-10-28T13:00:00.000Z',
				to: '2026-10-28T14:30:00.000Z',
				slot: true
			},
			{
				from: '2026-10-28T23:30:00.000Z',
				to: '2026-10-29T05:30:00.000Z',
				slot: false
			}
		]);
	});

	it('covers the night the clocks go back, an hour longer', () => {
		const [night] = cheapTimes(new Date('2026-10-25T00:00:00Z'), new Date('2026-10-25T01:00:00Z'), []);
		// 23:30 BST on the 24th to 05:30 GMT on the 25th: seven hours.
		expect(night).toEqual({
			from: '2026-10-24T22:30:00.000Z',
			to: '2026-10-25T05:30:00.000Z',
			slot: false
		});
	});
});

describe('cheapNow', () => {
	it('gives the next slot during Peak', () => {
		const { current, next, then } = cheapNow(at('08:15'), afternoon);
		expect(current).toBeNull();
		expect(next).toEqual({
			from: '2026-10-28T13:00:00.000Z',
			to: '2026-10-28T14:30:00.000Z',
			slot: true
		});
		expect(then.from).toBe('2026-10-28T23:30:00.000Z');
	});

	it('gives tonight’s window without a slot', () => {
		expect(cheapNow(at('08:15'), []).next.from).toBe('2026-10-28T23:30:00.000Z');
	});

	it('gives when the cheap time ends during it, and the one after', () => {
		const { current, next } = cheapNow(at('13:15'), afternoon);
		expect(current?.to).toBe('2026-10-28T14:30:00.000Z');
		expect(next.from).toBe('2026-10-28T23:30:00.000Z');
	});
});

describe('bestStart', () => {
	it('starts the 3-hour dishwasher between 23:30 and 02:30', () => {
		expect(bestStart(at('08:15'), 6, afternoon)).toEqual({
			earliest: '2026-10-28T23:30:00.000Z',
			latest: '2026-10-29T02:30:00.000Z',
			slot: false
		});
	});

	it('uses a slot long enough for the 1-hour washing machine', () => {
		expect(bestStart(at('08:15'), 2, afternoon)).toEqual({
			earliest: '2026-10-28T13:00:00.000Z',
			latest: '2026-10-28T13:30:00.000Z',
			slot: true
		});
	});

	it('starts now when it’s cheap now and there’s time', () => {
		const best = bestStart(at('01:10'), 4, []);
		expect(best.earliest).toBe('2026-10-28T01:10:00.000Z');
		expect(best.latest).toBe('2026-10-28T03:30:00.000Z');
	});

	it('waits for the next night when the window’s too nearly over', () => {
		expect(bestStart(at('04:00'), 4, []).earliest).toBe('2026-10-28T23:30:00.000Z');
	});
});

describe('formatStarts', () => {
	it.each([
		[
			{
				earliest: '2026-10-28T23:30:00.000Z',
				latest: '2026-10-29T02:30:00.000Z',
				slot: false
			},
			'23:30–02:30'
		],
		[
			{
				earliest: '2026-10-28T08:15:00.000Z',
				latest: '2026-10-28T09:00:00.000Z',
				slot: false
			},
			'Now–09:00'
		],
		[
			{
				earliest: '2026-10-28T13:00:00.000Z',
				latest: '2026-10-28T13:00:00.000Z',
				slot: true
			},
			'13:00'
		]
	])('formats %o as %s', (best, text) => {
		expect(formatStarts(best, at('08:15'))).toBe(text);
	});
});

describe('halfHoursOf', () => {
	it('has 48 Half-hours on a normal day, 50 when the clocks go back and 46 when they go forward', () => {
		expect(halfHoursOf('2026-10-28')).toHaveLength(48);
		expect(halfHoursOf('2026-10-25')).toHaveLength(50);
		expect(halfHoursOf('2026-03-29')).toHaveLength(46);
	});
});

describe('totals', () => {
	it('costs each Half-hour at its rate and says how much House use was off-peak', () => {
		const t = totals(
			[
				{ from: at('04:00').toISOString(), house: 0.2, car: 3.4 },
				{ from: at('13:00').toISOString(), house: 0.3, car: 0 },
				{ from: at('18:00').toISOString(), house: 0.5, car: 0 }
			],
			rates,
			afternoon
		);
		expect(t.house).toBeCloseTo(1);
		expect(t.car).toBeCloseTo(3.4);
		expect(t.houseCost).toBeCloseTo(0.5 * 7.5 + 0.5 * 27.4);
		expect(t.carCost).toBeCloseTo(3.4 * 7.5);
		expect(t.houseOffPeak).toBeCloseTo(0.5);
	});

	it('has nothing off-peak without House use', () => {
		expect(totals([], rates, []).houseOffPeak).toBe(0);
	});
});

describe('formatting', () => {
	it('formats prices, costs, power and lengths', () => {
		expect(formatPence(19.6612)).toBe('19.7p');
		expect(formatPounds(112.4)).toBe('£1.12');
		expect(formatKw(812)).toBe('0.8 kW');
		expect(formatLength(2)).toBe('1 hour');
		expect(formatLength(3)).toBe('1½ hours');
		expect(formatLength(6)).toBe('3 hours');
	});
});
