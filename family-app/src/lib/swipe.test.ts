import { describe, expect, it } from 'vitest';
import { DECIDE_AFTER, direction, FLICK_DISTANCE, FLICK_SPEED, removes } from './swipe.ts';

describe('telling a swipe from a scroll', () => {
	it("can't tell until the finger has moved far enough", () => {
		expect(direction(DECIDE_AFTER - 3, 3)).toBeNull();
		expect(direction(0, 0)).toBeNull();
	});

	it('is a swipe when the move is more sideways than up or down, either way', () => {
		expect(direction(12, 4)).toBe('sideways');
		expect(direction(-12, 4)).toBe('sideways');
		expect(direction(-12, -11)).toBe('sideways');
	});

	it('is a scroll when the move is more up or down', () => {
		expect(direction(4, 12)).toBe('vertical');
		expect(direction(-8, -12)).toBe('vertical');
		expect(direction(10, 10)).toBe('vertical');
	});
});

describe('whether letting go removes the item', () => {
	const width = 360;

	it('removes past a third of the width, either way, however slowly', () => {
		expect(removes(120, width, 0)).toBe(true);
		expect(removes(-120, width, 0)).toBe(true);
		expect(removes(-200, width, 0.1)).toBe(true);
	});

	it('slides back short of a third, when not flicked', () => {
		expect(removes(119, width, 0.2)).toBe(false);
		expect(removes(-60, width, -0.3)).toBe(false);
	});

	it('removes on a flick, fast enough and far enough, the same way it moved', () => {
		expect(removes(FLICK_DISTANCE, width, FLICK_SPEED)).toBe(true);
		expect(removes(-60, width, -1.2)).toBe(true);
	});

	it("doesn't remove on a flick that's too short, or back the other way", () => {
		expect(removes(FLICK_DISTANCE - 1, width, 2)).toBe(false);
		expect(removes(80, width, -1)).toBe(false);
	});
});
