import type { DatabaseSync } from 'node:sqlite';
import type { GameName } from '#lib/games.ts';
import type { Operator } from '#lib/number-game.ts';
import type { DayKey } from '#lib/time.ts';
import { getSetting, openHubDatabase, setSetting } from '../hub-db.ts';

// The Games' record in the Hub's database (ADR 0006): Word of the day's goes and Number of the day's steps, each saved
// as it's made, so a game carries on after a restart.

export interface WordGo {
	day: DayKey;
	member: string;
	word: string;
	/** When it was made, as an ISO string. */
	at: string;
}

export interface NumberStepRow {
	day: DayKey;
	member: string;
	a: number;
	op: Operator;
	b: number;
	at: string;
}

export interface NumberResultRow {
	day: DayKey;
	member: string;
	/** The number the Member finished on. */
	value: number;
	at: string;
}

export interface GameStore {
	/** Every go on a day, oldest first. */
	goes(day: DayKey): WordGo[];
	/** Every go a Member has made, on every day, oldest first. */
	goesBy(member: string): WordGo[];
	record(go: WordGo): void;
	/** Number of the day's steps on a day, oldest first. */
	numberSteps(day: DayKey): NumberStepRow[];
	recordStep(step: NumberStepRow): void;
	/** Takes back a Member's last step on a day. */
	undoStep(day: DayKey, member: string): void;
	/** Takes back all of a Member's steps on a day. */
	clearSteps(day: DayKey, member: string): void;
	/** How each Member's Number of the day ended on a day. */
	numberResults(day: DayKey): NumberResultRow[];
	/** How every Number of the day a Member has finished ended, on every day. */
	numberResultsBy(member: string): NumberResultRow[];
	recordResult(result: NumberResultRow): void;
	/** The game chosen last on a day: Word of the day until another is chosen that day. */
	chosenGame(day: DayKey): GameName;
	chooseGame(game: GameName, day: DayKey): void;
	close(): void;
}

const CHOSEN = 'games.chosen';

/**
 * The goes in the Hub's database: the open one, or a new one at `path`, created and upgraded as needed. `:memory:`
 * keeps it in memory. Closing only closes a database it opened itself.
 */
export function openGameStore(at: string | DatabaseSync): GameStore {
	const owned = typeof at === 'string';
	const db = owned ? openHubDatabase(at) : at;

	const select = db.prepare('SELECT day, member, word, at FROM word_goes WHERE day = ? ORDER BY id');
	const selectBy = db.prepare('SELECT day, member, word, at FROM word_goes WHERE member = ? ORDER BY id');
	const insert = db.prepare('INSERT INTO word_goes (day, member, word, at) VALUES (?, ?, ?, ?)');
	const steps = db.prepare('SELECT day, member, a, op, b, at FROM number_steps WHERE day = ? ORDER BY id');
	const insertStep = db.prepare('INSERT INTO number_steps (day, member, a, op, b, at) VALUES (?, ?, ?, ?, ?, ?)');
	const undoStep = db.prepare(
		'DELETE FROM number_steps WHERE id = (SELECT MAX(id) FROM number_steps WHERE day = ? AND member = ?)'
	);
	const clearSteps = db.prepare('DELETE FROM number_steps WHERE day = ? AND member = ?');
	const results = db.prepare('SELECT day, member, value, at FROM number_results WHERE day = ?');
	const resultsBy = db.prepare('SELECT day, member, value, at FROM number_results WHERE member = ? ORDER BY day');
	const insertResult = db.prepare('INSERT INTO number_results (day, member, value, at) VALUES (?, ?, ?, ?)');
	return {
		goes(day) {
			return select.all(day) as unknown as WordGo[];
		},
		goesBy(member) {
			return selectBy.all(member) as unknown as WordGo[];
		},
		record(go) {
			insert.run(go.day, go.member, go.word, go.at);
		},
		numberSteps(day) {
			return steps.all(day) as unknown as NumberStepRow[];
		},
		recordStep(step) {
			insertStep.run(step.day, step.member, step.a, step.op, step.b, step.at);
		},
		undoStep(day, member) {
			undoStep.run(day, member);
		},
		clearSteps(day, member) {
			clearSteps.run(day, member);
		},
		numberResults(day) {
			return results.all(day) as unknown as NumberResultRow[];
		},
		numberResultsBy(member) {
			return resultsBy.all(member) as unknown as NumberResultRow[];
		},
		recordResult(result) {
			insertResult.run(result.day, result.member, result.value, result.at);
		},
		chosenGame(day) {
			const chosen = getSetting<{ game: GameName; day: DayKey }>(db, CHOSEN);
			return chosen?.day === day ? chosen.game : 'word';
		},
		chooseGame(game, day) {
			setSetting(db, CHOSEN, { game, day });
		},
		close() {
			if (owned) db.close();
		}
	};
}
