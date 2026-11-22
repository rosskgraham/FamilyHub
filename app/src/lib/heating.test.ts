import { describe, expect, it } from 'vitest';
import { isAllowedTarget, MAX_TARGET, MIN_TARGET, stepTarget, whyNoTarget, type Heating } from './heating.ts';

const heat: Heating = { reporting: true, temperature: 19.5, humidity: 67, heating: true, mode: 'heat', target: 21 };

describe('the target', () => {
	it('moves 0.5° a tap', () => {
		expect(stepTarget(21, 1)).toBe(21.5);
		expect(stepTarget(21, -1)).toBe(20.5);
	});

	it('stops at 16° and 22°', () => {
		expect([MIN_TARGET, MAX_TARGET]).toEqual([16, 22]);
		expect(stepTarget(22, 1)).toBe(22);
		expect(stepTarget(16, -1)).toBe(16);
	});

	it('comes back within the limits from a target set on the dial outside them', () => {
		expect(stepTarget(24, -1)).toBe(22);
		expect(stepTarget(11, 1)).toBe(16);
	});

	it('lands on a step from a target the Nest has between them', () => {
		expect(stepTarget(20.3, 1)).toBe(21);
		expect(stepTarget(20.3, -1)).toBe(20);
	});

	it('is only sent within the limits and on a step', () => {
		for (const ok of [16, 16.5, 21, 22]) expect(isAllowedTarget(ok)).toBe(true);
		for (const no of [15.5, 22.5, 21.2, '21', null, undefined, Number.NaN]) expect(isAllowedTarget(no)).toBe(false);
	});
});

describe('why the target can’t be changed', () => {
	it('can be in Heat', () => {
		expect(whyNoTarget(heat)).toBeNull();
	});

	it('can’t in Eco or Off, or when the Nest isn’t reporting or saying its target', () => {
		expect(whyNoTarget({ ...heat, mode: 'eco', target: 12 })).toBe(
			'The Nest is in Eco, so the target can’t be changed here. Turn Eco off on the Nest or in the Nest app.'
		);
		expect(whyNoTarget({ ...heat, mode: 'off', target: null })).toMatch(/^The heating is off/);
		expect(whyNoTarget({ reporting: false, since: null })).toMatch(/^The Nest isn’t reporting/);
		expect(whyNoTarget({ reporting: false, since: null, signInEnded: true })).toMatch(
			/Connect it again in Settings\.$/
		);
		expect(whyNoTarget({ ...heat, target: null })).toMatch(/isn’t saying its target/);
	});
});
