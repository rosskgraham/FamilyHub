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
