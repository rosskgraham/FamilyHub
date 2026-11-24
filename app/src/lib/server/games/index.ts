import { CALENDAR_SOURCE } from '$app/env/private';
import { EVERYONE, sampleHousehold, type Household } from '#lib/household.ts';
import { dayKey, type DayKey } from '#lib/time.ts';
import { gameState, isFinished, score, WORD_LENGTH, type GameState, type Go, type PlayerCard } from '#lib/word-game.ts';
import { configuredHousehold } from '../household.ts';
import { hubDatabase } from '../hub-db.ts';
import { now } from '../now.ts';
import { openGameStore, type GameStore } from './store.ts';
import { wordFor } from './today.ts';
import { answers, isAllowedGuess } from './words.ts';

// Word of the day at the wall (AB#68). Everyone plays their own game of the same word, and the word never leaves the
// server until that Member's game is finished.

export interface GamesSetup {
	household: Household;
	store: GameStore;
	sample: boolean;
}

let real: GameStore | undefined;
let sample: GameStore | undefined;

/**
 * The real Household with its goes in the Hub's database, or, until the Household is set up, the sample Household
 * with sample games kept in memory, which reset when the app restarts. CALENDAR_SOURCE=sample forces the sample.
 */
export async function gamesSetup(): Promise<GamesSetup> {
	if (CALENDAR_SOURCE !== 'sample') {
		const { household, configured } = await configuredHousehold();
		if (configured) return { household, store: (real ??= openGameStore(hubDatabase())), sample: false };
	}
	if (!sample) {
		sample = openGameStore(':memory:');
		const day = dayKey(now());
		for (const go of sampleGoes(day)) sample.record(go);
	}
	return { household: sampleHousehold, store: sample, sample: true };
}

/** The Members who play, in the Household's order. */
export function players(household: Household): string[] {
	return Object.keys(household).filter((id) => id !== EVERYONE);
}

/** A Member's game today: their goes with their marks, and where it is. */
export interface Game {
	goes: Go[];
	state: GameState;
}

function gameOf(store: GameStore, member: string, day: DayKey): Game {
	const answer = wordFor(day, answers);
	const goes = store
		.goes(day)
		.filter((g) => g.member === member)
		.map((g) => ({ word: g.word, marks: score(answer, g.word) }));
	return { goes, state: gameState(goes) };
}

/** Each Member's card for the Games Section. A finished game gives only its marks, never its letters. */
export function playerCards({ household, store }: GamesSetup, day: DayKey = dayKey(now())): PlayerCard[] {
	return players(household).map((member) => {
		const { goes, state } = gameOf(store, member, day);
		return { member, state, goes: goes.length, marks: isFinished(state) ? goes.map((g) => g.marks) : [] };
	});
}

/** A Member's game today, to carry on playing. Null for a game that's finished, whose letters stay hidden. */
export function gameToPlay({ store }: GamesSetup, member: string, day: DayKey = dayKey(now())): Game | null {
	const game = gameOf(store, member, day);
	return isFinished(game.state) ? null : game;
}

/** What happened to a go: its marks, and the word once the game is finished. Or why it didn't count. */
export type GoResult =
	| { ok: true; go: Go; state: GameState; answer?: string }
	| { ok: false; problem: 'not a player' | 'finished' | 'too short' | 'not a word' };

/** Makes a go, if it's five letters and a word the Hub knows. One that isn't uses no go. */
export function makeGo(setup: GamesSetup, member: string, guess: string): GoResult {
	if (!players(setup.household).includes(member)) return { ok: false, problem: 'not a player' };
	const at = now();
	const day = dayKey(at);
	const game = gameOf(setup.store, member, day);
	if (isFinished(game.state)) return { ok: false, problem: 'finished' };
	const word = guess.trim().toLowerCase();
	if (!new RegExp(`^[a-z]{${WORD_LENGTH}}$`).test(word)) return { ok: false, problem: 'too short' };
	if (!isAllowedGuess(word)) return { ok: false, problem: 'not a word' };

	setup.store.record({ day, member, word, at: at.toISOString() });
	const answer = wordFor(day, answers);
	const go = { word, marks: score(answer, word) };
	const state = gameState([...game.goes, go]);
	return { ok: true, go, state, ...(isFinished(state) ? { answer } : {}) };
}

// Sample games for today, so the Games Section shows one in progress and some finished: Ross solved it in three and
// Maya in four, Leo has had two goes, and Sam hasn't played.
function sampleGoes(day: DayKey) {
	const answer = wordFor(day, answers);
	const tries = ['storm', 'clean', 'brick', 'judge'].filter((w) => w !== answer);
	const at = `${day}T07:00:00.000Z`;
	const goes = (member: string, words: string[]) => words.map((word) => ({ day, member, word, at }));
	return [
		...goes('ross', [...tries.slice(0, 2), answer]),
		...goes('maya', [...tries.slice(1, 4), answer]),
		...goes('leo', tries.slice(0, 2))
	];
}
