import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SLEEP_HOURS,
	inLightsOut,
	inSleepHours,
	isAsleep,
	showSleepTime,
	stepHours,
	validSleepHours,
	type SleepHours
} from './sleep.ts';

const schedule = { from: '22:00', until: '06:30' };

describe('inSleepHours', () => {
	it.each([
		['2026-10-28T21:59:00Z', false],
		['2026-10-28T22:00:00Z', true],
		['2026-10-29T02:00:00Z', true],
		['2026-10-29T06:29:00Z', true],
		['2026-10-29T06:30:00Z', false],
		['2026-10-29T12:00:00Z', false]
	])('at %s is %s, overnight', (at, asleep) => {
		expect(inSleepHours(new Date(at), schedule)).toBe(asleep);
	});

	it('works for a schedule within one day', () => {
		const afternoon = { from: '13:00', until: '15:00' };
		expect(inSleepHours(new Date('2026-10-28T14:00:00Z'), afternoon)).toBe(true);
		expect(inSleepHours(new Date('2026-10-28T23:00:00Z'), afternoon)).toBe(false);
	});

	it('reads the schedule as UK times, in summer time too', () => {
		// 22:30 BST is 21:30 UTC.
		expect(inSleepHours(new Date('2026-07-01T21:30:00Z'), schedule)).toBe(true);
	});

	it('follows the hours chosen in Settings', () => {
		const early = { from: '20:30', until: '06:30' };
		expect(inSleepHours(new Date('2026-10-28T21:00:00Z'), early)).toBe(true);
		expect(inSleepHours(new Date('2026-10-28T21:00:00Z'), schedule)).toBe(false);
	});
});

describe('isAsleep', () => {
	const night = new Date('2026-10-28T23:00:00Z');
	const ago = (ms: number) => new Date(night.getTime() - ms);

	it('sleeps in Sleep hours until touched', () => {
		expect(isAsleep(night, null, schedule)).toBe(true);
	});

	it('stays awake for two minutes after a touch, then sleeps again', () => {
		expect(isAsleep(night, ago(119_000), schedule)).toBe(false);
		expect(isAsleep(night, ago(120_000), schedule)).toBe(true);
	});

	it('never sleeps outside Sleep hours', () => {
		expect(isAsleep(new Date('2026-10-28T12:00:00Z'), null, schedule)).toBe(false);
	});
});

describe('inLightsOut', () => {
	const hours = DEFAULT_SLEEP_HOURS;

	it.each([
		['2026-10-28T23:59:00Z', false],
		['2026-10-29T00:00:00Z', true],
		['2026-10-29T05:59:00Z', true],
		['2026-10-29T06:00:00Z', false],
		['2026-10-29T12:00:00Z', false]
	])('at %s is %s, across midnight', (at, dark) => {
		expect(inLightsOut(new Date(at), hours)).toBe(dark);
	});

	it('is never Lights out when it is turned off', () => {
		expect(inLightsOut(new Date('2026-10-29T02:00:00Z'), { ...hours, lightsOutOn: false })).toBe(false);
	});

	// British Summer Time ends at 01:00 UTC on Sunday 25 October 2026, so 01:00 to 02:00 happens twice that night.
	it('follows UK time through the clocks going back', () => {
		expect(inLightsOut(new Date('2026-10-24T23:30:00Z'), hours)).toBe(true); // 00:30 BST
		expect(inLightsOut(new Date('2026-10-25T00:30:00Z'), hours)).toBe(true); // 01:30 BST
		expect(inLightsOut(new Date('2026-10-25T01:30:00Z'), hours)).toBe(true); // 01:30 GMT
		expect(inLightsOut(new Date('2026-10-25T05:59:00Z'), hours)).toBe(true); // 05:59 GMT
		expect(inLightsOut(new Date('2026-10-25T06:00:00Z'), hours)).toBe(false); // 06:00 GMT
	});

	// British Summer Time starts at 01:00 UTC on Sunday 29 March 2026: 01:00 GMT becomes 02:00 BST.
	it('follows UK time through the clocks going forward', () => {
		expect(inLightsOut(new Date('2026-03-29T00:30:00Z'), hours)).toBe(true); // 00:30 GMT
		expect(inLightsOut(new Date('2026-03-29T04:59:00Z'), hours)).toBe(true); // 05:59 BST
		expect(inLightsOut(new Date('2026-03-29T05:00:00Z'), hours)).toBe(false); // 06:00 BST
	});
});

describe('stepHours', () => {
	const hours = DEFAULT_SLEEP_HOURS;
	const times = (h: SleepHours | null) =>
		h && `${h.sleep.from}–${h.sleep.until}, ${h.lightsOut.from}–${h.lightsOut.until}`;

	it('moves one time by the step, across midnight too', () => {
		expect(times(stepHours(hours, 'sleepFrom', -30))).toBe('21:30–06:30, 00:00–06:00');
		expect(times(stepHours(hours, 'lightsOutFrom', -30))).toBe('22:00–06:30, 23:30–06:00');
		expect(times(stepHours(hours, 'lightsOutUntil', 30))).toBe('22:00–06:30, 00:00–06:30');
	});

	it("doesn't let Lights out go past either end of Sleep", () => {
		const atEnd = stepHours(hours, 'lightsOutUntil', 30)!;
		expect(stepHours(atEnd, 'lightsOutUntil', 30)).toBeNull();
		const atStart = { ...hours, lightsOut: { from: '22:00', until: '06:00' } };
		expect(stepHours(atStart, 'lightsOutFrom', -30)).toBeNull();
	});

	it('moves Lights out in with Sleep', () => {
		expect(times(stepHours(hours, 'sleepUntil', -60))).toBe('22:00–05:30, 00:00–05:30');
		const lateStart = { ...hours, sleep: { from: '23:30', until: '06:30' } };
		expect(times(stepHours(lateStart, 'sleepFrom', 60))).toBe('00:30–06:30, 00:30–06:00');
	});

	it('keeps each at least one step long', () => {
		const short = { ...hours, lightsOut: { from: '05:30', until: '06:00' } };
		expect(stepHours(short, 'lightsOutFrom', 30)).toBeNull();
		expect(stepHours(short, 'lightsOutUntil', -30)).toBeNull();
		// Sleep can't shrink past a Lights out one step long.
		const tight = { ...short, sleep: { from: '05:30', until: '06:00' } };
		expect(stepHours(tight, 'sleepUntil', -30)).toBeNull();
	});

	it('keeps Sleep under a day', () => {
		const long = { ...hours, sleep: { from: '06:00', until: '05:30' }, lightsOut: { from: '00:00', until: '05:30' } };
		expect(stepHours(long, 'sleepUntil', 30)).toBeNull();
		expect(stepHours(long, 'sleepFrom', -30)).toBeNull();
	});

	it('keeps whether Lights out is on', () => {
		expect(stepHours({ ...hours, lightsOutOn: false }, 'sleepFrom', 30)?.lightsOutOn).toBe(false);
	});
});

describe('validSleepHours', () => {
	it('keeps saved hours that fit', () => {
		const saved = {
			sleep: { from: '21:00', until: '07:00' },
			lightsOut: { from: '23:00', until: '05:00' },
			lightsOutOn: false
		};
		expect(validSleepHours(saved)).toEqual(saved);
	});

	it.each([
		['nothing saved', undefined],
		['a time that is not HH:mm', { ...DEFAULT_SLEEP_HOURS, sleep: { from: '9pm', until: '06:30' } }],
		['Lights out outside Sleep', { ...DEFAULT_SLEEP_HOURS, lightsOut: { from: '20:00', until: '06:00' } }],
		['no on or off', { sleep: DEFAULT_SLEEP_HOURS.sleep, lightsOut: DEFAULT_SLEEP_HOURS.lightsOut }]
	])('uses the defaults for %s', (_, saved) => {
		expect(validSleepHours(saved)).toEqual(DEFAULT_SLEEP_HOURS);
	});
});

describe('showSleepTime', () => {
	it('follows the clock format', () => {
		expect(showSleepTime('22:00', '24h')).toBe('22:00');
		expect(showSleepTime('22:00', '12h')).toBe('10:00 pm');
		expect(showSleepTime('00:00', '12h')).toBe('12:00 am');
	});
});
