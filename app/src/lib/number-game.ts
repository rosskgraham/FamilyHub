// Number of the day (AB#90): six numbers and a target, and + − × ÷ to reach it. What the screen and the server share;
// one way to reach the target only ever lives on the server until a game is finished.

/** One of each large number. */
export const LARGE = [25, 50, 75, 100] as const;
/** Two of each small number. */
export const SMALL = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10] as const;
export const NUMBER_COUNT = 6;
export const TARGET_MIN = 101;
export const TARGET_MAX = 999;

export type Operator = '+' | '−' | '×' | '÷';
export const OPERATORS: readonly Operator[] = ['+', '−', '×', '÷'];

/** One step: two numbers joined into one new number. */
export interface Step {
	a: number;
	op: Operator;
	b: number;
	answer: number;
}

/** Why a step isn't allowed: every answer must be a positive whole number, from numbers that are still left. */
export type Refusal = 'zero' | 'negative' | 'fraction' | 'not-left';

/** The answer to a op b, or why it isn't allowed. */
export function calculate(a: number, op: Operator, b: number): number | Refusal {
	switch (op) {
		case '+':
			return a + b;
		case '×':
			return a * b;
		case '−':
			return a === b ? 'zero' : a < b ? 'negative' : a - b;
		case '÷':
			return a % b === 0 ? a / b : 'fraction';
	}
}

/**
 * The numbers left after a step: a and b are taken out, one of each, and the answer is added at the end. Refused if
 * the answer isn't allowed, or if a or b isn't left (a number used twice needs it twice).
 */
export function applyStep(numbers: readonly number[], a: number, op: Operator, b: number): number[] | Refusal {
	const left = [...numbers];
	for (const n of [a, b]) {
		const i = left.indexOf(n);
		if (i < 0) return 'not-left';
		left.splice(i, 1);
	}
	const answer = calculate(a, op, b);
	return typeof answer === 'number' ? [...left, answer] : answer;
}

/** What the bar under the numbers says about a step that isn't allowed (AB#91). */
export const REFUSALS: Record<Refusal, string> = {
	zero: 'That gives zero',
	negative: 'That would be less than nothing',
	fraction: 'That gives a fraction',
	'not-left': 'That number’s been used'
};

/** Where a Member is with today's numbers: not started, part way, or finished on the target or short of it. */
export type NumberState = 'new' | 'playing' | 'got' | 'away';

/** A Member's game: the numbers left, their steps, and how it ended if it has. */
export interface NumberGame {
	numbers: number[];
	target: number;
	steps: Step[];
	state: NumberState;
	/** How far the number finished with is from the target, once finished. */
	away: number | null;
}

/** One Member's card on the Games Section. A finished game shows only how close it got, never how. */
export interface NumberCard {
	member: string;
	state: NumberState;
	steps: number;
	away: number | null;
	/** Days in a row with a finished game (AB#92). */
	streak: number;
}

/**
 * The end of a game (AB#92): the number finished on, one of the shortest ways to the target, the Member's streak, and
 * how everyone has done today. Only the Member who just finished is ever sent it.
 */
export interface NumberEnd {
	value: number;
	solution: Step[];
	streak: number;
	cards: NumberCard[];
}

export const isNumberGameFinished = (state: NumberState) => state === 'got' || state === 'away';

/** The number nearest the target, the first of them on a tie. */
export function closest(numbers: readonly number[], target: number): number {
	return numbers.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best));
}

/** A finished game's result, in words. */
export function numberResult(state: NumberState, away: number | null): string {
	return state === 'got' ? 'Got it' : `${away} away`;
}

/** How a Member's game today is going, in words. */
export function numberStatus(state: NumberState, steps: number): string {
	if (state === 'new') return 'Not played yet';
	if (state === 'playing') return `${steps} ${steps === 1 ? 'step' : 'steps'} so far`;
	return 'Finished today';
}
