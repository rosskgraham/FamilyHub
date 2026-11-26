import type { DayKey } from '#lib/time.ts';
import { LARGE, NUMBER_COUNT, SMALL, TARGET_MAX, TARGET_MIN, type Operator, type Step } from '#lib/number-game.ts';
import { daysBetween, random } from './random.ts';

// Number of the day's draw and solver (AB#90). Everyone gets the same six numbers and target, worked out from the
// date, and the target can always be reached exactly. The solver's way to reach it stays on the server.

/** The day the draws start from. Changing it changes every day's draw. */
const FIRST_DAY = '2026-01-01';
/** The draws' seed. Changing it changes every day's draw. */
const SEED = 0x5eed_0090;
/** How likely each count of large numbers is, from 0 to 4, out of their total. */
const LARGE_WEIGHTS = [1, 3, 3, 2, 1];

export interface Draw {
	/** Largest first. */
	numbers: number[];
	target: number;
}

/** The closest the numbers can get to a target, and one of the shortest ways to get there. */
export interface Solution {
	value: number;
	steps: Step[];
}

// How a value was made from a set of the numbers: the two smaller sets it joins, or nothing for one of the numbers.
interface Made {
	left: number;
	leftSet: number;
	op: Operator;
	right: number;
	rightSet: number;
}

/** Every value each set of the numbers can make, by bitmask of which numbers it uses. */
type Reachable = Map<number, Made | null>[];

function reachable(numbers: readonly number[]): Reachable {
	const all = (1 << numbers.length) - 1;
	const sets: Reachable = Array.from({ length: all + 1 }, () => new Map());
	numbers.forEach((n, i) => sets[1 << i]!.set(n, null));
	// A set's smaller sets are always lower numbers, so counting up has them ready.
	for (let set = 1; set <= all; set++) {
		if ((set & (set - 1)) === 0) continue;
		const made = sets[set]!;
		const lowest = set & -set;
		// Each split into two once: the part with the lowest number on the left.
		for (let leftSet = (set - 1) & set; leftSet > 0; leftSet = (leftSet - 1) & set) {
			if (!(leftSet & lowest)) continue;
			const rightSet = set ^ leftSet;
			const add = (answer: number, left: number, aSet: number, op: Operator, right: number, bSet: number) => {
				if (!made.has(answer)) made.set(answer, { left, leftSet: aSet, op, right, rightSet: bSet });
			};
			const ys = [...sets[rightSet]!.keys()];
			for (const x of sets[leftSet]!.keys()) {
				for (const y of ys) {
					// The same rules as calculate(), inline because this runs a million times a day. × 1 and ÷ 1 are
					// left out: they only make a number already there, with one more number used.
					add(x + y, x, leftSet, '+', y, rightSet);
					if (x !== 1 && y !== 1) add(x * y, x, leftSet, '×', y, rightSet);
					if (x > y) add(x - y, x, leftSet, '−', y, rightSet);
					else if (y > x) add(y - x, y, rightSet, '−', x, leftSet);
					if (y !== 1 && x % y === 0) add(x / y, x, leftSet, '÷', y, rightSet);
					if (x !== 1 && y % x === 0) add(y / x, y, rightSet, '÷', x, leftSet);
				}
			}
		}
	}
	return sets;
}

const size = (set: number) => {
	let n = 0;
	for (; set; set &= set - 1) n++;
	return n;
};

function stepsTo(sets: Reachable, set: number, value: number): Step[] {
	const made = sets[set]!.get(value);
	if (!made) return [];
	return [
		...stepsTo(sets, made.leftSet, made.left),
		...stepsTo(sets, made.rightSet, made.right),
		{ a: made.left, op: made.op, b: made.right, answer: value }
	];
}

function solveWith(sets: Reachable, target: number): Solution {
	// Fewer numbers used means fewer steps, so the smallest sets are tried first.
	const order = sets.map((_, set) => set).slice(1);
	order.sort((p, q) => size(p) - size(q) || p - q);
	let best: { set: number; value: number } | undefined;
	for (const set of order) {
		for (const value of sets[set]!.keys()) {
			if (!best || Math.abs(value - target) < Math.abs(best.value - target)) best = { set, value };
		}
		if (best?.value === target) break;
	}
	return { value: best!.value, steps: stepsTo(sets, best!.set, best!.value) };
}

/** The closest the numbers can get to the target, and one of the shortest ways to get there. */
export function solve(numbers: readonly number[], target: number): Solution {
	return solveWith(reachable(numbers), target);
}

/** Takes k numbers from a pool at random, without putting any back. */
function take(pool: readonly number[], k: number, next: () => number): number[] {
	const left = [...pool];
	const taken: number[] = [];
	for (let i = 0; i < k; i++) taken.push(...left.splice(Math.floor(next() * left.length), 1));
	return taken;
}

function largeCount(next: () => number): number {
	let r = next() * LARGE_WEIGHTS.reduce((sum, w) => sum + w, 0);
	for (const [count, weight] of LARGE_WEIGHTS.entries()) if ((r -= weight) < 0) return count;
	return LARGE_WEIGHTS.length - 1;
}

interface Day {
	draw: Draw;
	solution: Solution;
}

let cached: { day: DayKey; value: Day } | undefined;

function dayOf(day: DayKey): Day {
	if (cached?.day === day) return cached.value;
	const next = random((SEED + Math.imul(daysBetween(FIRST_DAY, day), 0x9e3779b9)) >>> 0);
	let numbers: number[];
	let sets: Reachable;
	let exact: Set<number>;
	// A few small draws, such as 1, 1, 2, 2, 3, 3, can't reach any target, so they're drawn again.
	do {
		const large = largeCount(next);
		numbers = [...take(LARGE, large, next), ...take(SMALL, NUMBER_COUNT - large, next)].sort((p, q) => q - p);
		sets = reachable(numbers);
		exact = new Set(sets.flatMap((made) => [...made.keys()]));
	} while (![...exact].some((n) => n >= TARGET_MIN && n <= TARGET_MAX));
	// Targets are drawn from the day's own sequence until one can be reached, so each date always gets the same one.
	let target: number;
	do target = TARGET_MIN + Math.floor(next() * (TARGET_MAX - TARGET_MIN + 1));
	while (!exact.has(target));
	const value = { draw: { numbers, target }, solution: solveWith(sets, target) };
	cached = { day, value };
	return value;
}

/** The day's six numbers and target, the same for everyone. */
export function drawFor(day: DayKey): Draw {
	const { numbers, target } = dayOf(day).draw;
	return { numbers: [...numbers], target };
}

/** One of the shortest ways to reach the day's target. Only for a Member whose game is finished. */
export function solutionFor(day: DayKey): Step[] {
	return dayOf(day).solution.steps.map((step) => ({ ...step }));
}
