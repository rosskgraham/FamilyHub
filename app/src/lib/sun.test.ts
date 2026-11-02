import { describe, expect, it } from 'vitest';
import { sunTimesOn } from './sun.ts';

/** Minutes since midnight, to compare times within a margin. */
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

describe('sunTimesOn', () => {
	// Published times, to the minute; the calculation is good to a minute or two.
	it.each([
		['London at midsummer, in summer time', '2026-06-21', 51.5074, -0.1278, '04:43', '21:21'],
		['London at midwinter', '2026-12-21', 51.5074, -0.1278, '08:04', '15:53'],
		['Edinburgh at midsummer', '2026-06-21', 55.9533, -3.1883, '04:26', '22:03'],
		['Edinburgh at midwinter', '2026-12-21', 55.9533, -3.1883, '08:42', '15:40']
	])('gives sunrise and sunset in %s, as UK times', (_, day, latitude, longitude, sunrise, sunset) => {
		const sun = sunTimesOn(day, latitude, longitude);
		expect(Math.abs(minutes(sun.sunrise) - minutes(sunrise))).toBeLessThanOrEqual(2);
		expect(Math.abs(minutes(sun.sunset) - minutes(sunset))).toBeLessThanOrEqual(2);
	});

	it('moves sunrise about an hour earlier by the clock when the clocks go back', () => {
		const before = sunTimesOn('2026-10-24', 51.5074, -0.1278);
		const after = sunTimesOn('2026-10-25', 51.5074, -0.1278);
		expect(minutes(before.sunrise) - minutes(after.sunrise)).toBeGreaterThanOrEqual(56);
		expect(minutes(before.sunrise) - minutes(after.sunrise)).toBeLessThanOrEqual(60);
	});

	it('gives times as HH:mm', () => {
		expect(sunTimesOn('2026-12-21', 51.5074, -0.1278)).toEqual({ sunrise: expect.stringMatching(/^\d\d:\d\d$/), sunset: expect.stringMatching(/^\d\d:\d\d$/) });
	});
});
