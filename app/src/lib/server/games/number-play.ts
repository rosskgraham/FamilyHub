import {
	applyStep,
	isNumberGameFinished,
	type NumberCard,
	type NumberEnd,
	type NumberGame,
	type Operator,
	type Refusal,
	type Step
} from '#lib/number-game.ts';
import { dayKey, type DayKey } from '#lib/time.ts';
import { streak } from '#lib/word-game.ts';
import { now } from '../now.ts';
import { players, type GamesSetup } from './index.ts';
import { drawFor, solutionFor } from './numbers.ts';
import type { GameStore } from './store.ts';

// Number of the day at the wall (AB#91, AB#92). Everyone plays their own game of the same six numbers, and one way to
// reach the target leaves the server only for a Member who has just finished.

/** A Member's game on a day, from the steps they've kept and how it ended. */
function gameOf(store: GameStore, member: string, day: DayKey): NumberGame {
	const { numbers: drawn, target } = drawFor(day);
	let numbers = drawn;
	const steps: Step[] = [];
	for (const { a, op, b } of store.numberSteps(day).filter((s) => s.member === member)) {
		const next = applyStep(numbers, a, op, b);
		// Only allowed steps are kept, so this never happens unless the draw itself changed.
		if (typeof next === 'string') break;
		numbers = next;
		steps.push({ a, op, b, answer: next.at(-1)! });
	}
	const result = store.numberResults(day).find((r) => r.member === member);
	if (result) {
		const away = Math.abs(result.value - target);
		return { numbers, target, steps, state: away === 0 ? 'got' : 'away', away };
	}
	return { numbers, target, steps, state: steps.length ? 'playing' : 'new', away: null };
}

/**
 * A Member's streak up to a day: the days in a row on which they finished Number of the day, got or not, by Word of
 * the day's rule. It's a streak of its own.
 */
export function numberStreakOf(store: GameStore, member: string, day: DayKey): number {
	return streak(new Set(store.numberResultsBy(member).map((r) => r.day)), day);
}

/** Each Member's card for Number of the day. A finished game gives only how close it got, never how. */
export function numberCards({ household, store }: GamesSetup, day: DayKey = dayKey(now())): NumberCard[] {
	return players(household).map((member) => {
		const { state, steps, away } = gameOf(store, member, day);
		return { member, state, steps: steps.length, away, streak: numberStreakOf(store, member, day) };
	});
}

/** A Member's game today, to carry on playing, with their streak. Null for a game that's finished. */
export function numberGameToPlay(
	{ store }: GamesSetup,
	member: string,
	day: DayKey = dayKey(now())
): (NumberGame & { streak: number }) | null {
	const game = gameOf(store, member, day);
	return isNumberGameFinished(game.state) ? null : { ...game, streak: numberStreakOf(store, member, day) };
}

/** What a Member does: a step, Undo, Start again, or Finish with one of the numbers left. */
export type NumberMove =
	| { kind: 'step'; a: number; op: Operator; b: number }
	| { kind: 'undo' }
	| { kind: 'restart' }
	| { kind: 'finish'; value: number };

/** The game after a move, with its end if the move finished it, or why the move wasn't made. */
export type NumberMoveResult =
	| { ok: true; game: NumberGame; end?: NumberEnd }
	| { ok: false; problem: Refusal | 'not a player' | 'finished' | 'not left' };

/** Makes a move in a Member's game today. A step that makes the target finishes the game. */
export function makeNumberMove(setup: GamesSetup, member: string, move: NumberMove): NumberMoveResult {
	if (!players(setup.household).includes(member)) return { ok: false, problem: 'not a player' };
	const at = now();
	const day = dayKey(at);
	const { store } = setup;
	const game = gameOf(store, member, day);
	if (isNumberGameFinished(game.state)) return { ok: false, problem: 'finished' };

	// The number the game finishes on, if this move finishes it.
	let finished: number | undefined;
	switch (move.kind) {
		case 'step': {
			const next = applyStep(game.numbers, move.a, move.op, move.b);
			if (typeof next === 'string') return { ok: false, problem: next };
			store.recordStep({ day, member, a: move.a, op: move.op, b: move.b, at: at.toISOString() });
			if (next.at(-1) === game.target) finished = game.target;
			break;
		}
		case 'undo':
			store.undoStep(day, member);
			break;
		case 'restart':
			store.clearSteps(day, member);
			break;
		case 'finish':
			if (!game.numbers.includes(move.value)) return { ok: false, problem: 'not left' };
			finished = move.value;
			break;
	}
	if (finished !== undefined) store.recordResult({ day, member, value: finished, at: at.toISOString() });
	const after = gameOf(store, member, day);
	if (finished === undefined) return { ok: true, game: after };
	const end = {
		value: finished,
		solution: solutionFor(day),
		streak: numberStreakOf(store, member, day),
		cards: numberCards(setup, day)
	};
	return { ok: true, game: after, end };
}
