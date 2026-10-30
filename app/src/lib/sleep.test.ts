import { describe, expect, it } from 'vitest';
import { inSleepHours, isAsleep } from './sleep.ts';

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
