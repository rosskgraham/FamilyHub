import { describe, expect, it } from 'vitest';
import { applyStep, LARGE, SMALL, TARGET_MAX, TARGET_MIN, type Step } from '#lib/number-game.ts';
import { addDays } from '#lib/time.ts';
import { drawFor, solutionFor, solve } from './numbers.ts';

/** Follows the steps from the numbers, failing on any step that isn't allowed, and gives the numbers left. */
function follow(numbers: readonly number[], steps: readonly Step[]): number[] {
	let left = [...numbers];
	for (const { a, op, b, answer } of steps) {
		const next = applyStep(left, a, op, b);
		if (typeof next === 'string') throw new Error(`${a} ${op} ${b} from ${left.join(', ')}: ${next}`);
		expect(next.at(-1)).toBe(answer);
		left = next;
	}
	return left;
}

// Every day from 2026 to 2030.
const days = Array.from({ length: 1826 }, (_, i) => addDays('2026-01-01', i));
const isLarge = (n: number) => (LARGE as readonly number[]).includes(n);

describe('drawFor', () => {
	it('gives the same draw for the same date, every time', () => {
		expect(drawFor('2026-11-26')).toEqual(drawFor('2026-11-26'));
		const first = drawFor('2026-11-26');
		drawFor('2026-11-27');
		expect(drawFor('2026-11-26')).toEqual(first);
	});

	it('gives different draws on different days', () => {
		const year = days.slice(0, 365).map((day) => JSON.stringify(drawFor(day)));
		expect(new Set(year).size).toBeGreaterThan(360);
	}, 30_000);

	it('draws six numbers from the pool and a target the solver reaches, every day for five years', () => {
		const pool = new Map<number, number>();
		for (const n of [...LARGE, ...SMALL]) pool.set(n, (pool.get(n) ?? 0) + 1);
		const largeCounts = [0, 0, 0, 0, 0];
		for (const day of days) {
			const { numbers, target } = drawFor(day);
			expect(numbers).toHaveLength(6);
			const counts = new Map<number, number>();
			for (const n of numbers) counts.set(n, (counts.get(n) ?? 0) + 1);
			for (const [n, count] of counts) expect(count, `${day}: ${n}`).toBeLessThanOrEqual(pool.get(n) ?? 0);
			largeCounts[numbers.filter(isLarge).length]!++;

			expect(target).toBeGreaterThanOrEqual(TARGET_MIN);
			expect(target).toBeLessThanOrEqual(TARGET_MAX);
			expect(follow(numbers, solutionFor(day)), day).toContain(target);
		}
		expect(largeCounts.every((count) => count > 0)).toBe(true);
		const [none, one, two, three, four] = largeCounts as [number, number, number, number, number];
		expect(Math.min(one, two)).toBeGreaterThan(Math.max(none, three, four));
	}, 60_000);

	it('works out and solves a day in under 100 ms', () => {
		drawFor('2026-01-01');
		const start = performance.now();
		drawFor('2031-06-15');
		solutionFor('2031-06-15');
		expect(performance.now() - start).toBeLessThan(100);
	});
});

describe('solve', () => {
	it('finds one of the shortest ways to a known target', () => {
		const numbers = [100, 75, 50, 25, 6, 3];
		const { value, steps } = solve(numbers, 952);
		expect(value).toBe(952);
		expect(steps).toHaveLength(5);
		expect(follow(numbers, steps)).toContain(952);
		expect(solve(numbers, 106).steps).toHaveLength(1);
	});

	it('takes no steps for a target that’s already one of the numbers', () => {
		expect(solve([100, 75, 50, 25, 6, 3], 75)).toEqual({ value: 75, steps: [] });
	});

	it('gives the closest it can when the target can’t be reached', () => {
		const numbers = [3, 3, 2, 2, 1, 1];
		const { value, steps } = solve(numbers, 500);
		expect(value).toBe(81);
		expect(follow(numbers, steps)).toContain(81);
	});
});
