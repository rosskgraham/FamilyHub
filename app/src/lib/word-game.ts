// Word of the day (AB#68): a five-letter word a day, six goes to find it. What the screen and the server share; the
// word itself only ever lives on the server.

import { addDays, type DayKey } from './time.ts';

export const WORD_LENGTH = 5;
export const MAX_GOES = 6;
/** A streak shows on a Member's card from this many days. */
export const STREAK_SHOWN_FROM = 2;

/** How a letter of a go did: in the right place, in the word somewhere else, or not in the word. */
export type Mark = 'right' | 'present' | 'absent';

export interface Go {
	word: string;
	marks: Mark[];
}

/** The end of a game: the word, the Member's streak, and how everyone has done today, without letters. */
export interface GameEnd {
	answer: string;
	streak: number;
	cards: PlayerCard[];
}

/** Where a Member is with today's word. */
export type GameState = 'new' | 'playing' | 'solved' | 'lost';

/** One Member's card on the Games Section. A finished game shows only its marks, never its letters. */
export interface PlayerCard {
	member: string;
	state: GameState;
	goes: number;
	marks: Mark[][];
	/** Days in a row with a finished game. */
	streak: number;
}

/**
 * Marks each letter of a go against the answer. Right places are found first; then each other letter is in the word
 * only while the answer has that letter left over, so a letter guessed more often than it's in the word is marked
 * absent for the extras.
 */
export function score(answer: string, guess: string): Mark[] {
	const marks: Mark[] = Array.from({ length: guess.length }, () => 'absent');
	const left = new Map<string, number>();
	for (let i = 0; i < answer.length; i++) {
		if (guess[i] === answer[i]) marks[i] = 'right';
		else left.set(answer[i]!, (left.get(answer[i]!) ?? 0) + 1);
	}
	for (let i = 0; i < guess.length; i++) {
		const n = left.get(guess[i]!) ?? 0;
		if (marks[i] === 'right' || n === 0) continue;
		marks[i] = 'present';
		left.set(guess[i]!, n - 1);
	}
	return marks;
}

const rank: Record<Mark, number> = { absent: 1, present: 2, right: 3 };

/** Each letter tried so far, with its best mark, for colouring the keyboard. */
export function keyboardMarks(goes: readonly Go[]): Map<string, Mark> {
	const best = new Map<string, Mark>();
	for (const { word, marks } of goes) {
		[...word].forEach((letter, i) => {
			const now = best.get(letter);
			if (!now || rank[marks[i]!] > rank[now]) best.set(letter, marks[i]!);
		});
	}
	return best;
}

/** Where a game is, from its goes. */
export function gameState(goes: readonly Go[]): GameState {
	if (goes.length === 0) return 'new';
	if (goes.some((go) => go.marks.every((m) => m === 'right'))) return 'solved';
	return goes.length >= MAX_GOES ? 'lost' : 'playing';
}

export const isFinished = (state: GameState) => state === 'solved' || state === 'lost';

/**
 * A Member's streak: the days in a row, up to today or yesterday, on which they finished a game, solved or not. A day
 * with no finished game ends it, so a hard word never does. Today still counts until midnight, if not played yet.
 */
export function streak(finished: ReadonlySet<DayKey>, today: DayKey): number {
	let day = finished.has(today) ? today : addDays(today, -1);
	let days = 0;
	for (; finished.has(day); day = addDays(day, -1)) days++;
	return days;
}

/** How a Member's game today is going, in words. */
export function gameStatus(state: GameState, goes: number): string {
	if (state === 'new') return 'Not played yet';
	if (state === 'solved') return `Got it in ${goes}`;
	if (state === 'lost') return 'Not this time';
	return `${goes} of ${MAX_GOES} goes so far`;
}
