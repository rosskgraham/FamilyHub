import type { DatabaseSync } from 'node:sqlite';
import type { DayKey } from '#lib/time.ts';
import { openHubDatabase } from '../hub-db.ts';

// Word of the day's goes in the Hub's database (ADR 0006): each one saved as it's made, so a game carries on after a
// restart.

export interface WordGo {
	day: DayKey;
	member: string;
	word: string;
	/** When it was made, as an ISO string. */
	at: string;
}

export interface GameStore {
	/** Every go on a day, oldest first. */
	goes(day: DayKey): WordGo[];
	/** Every go a Member has made, on every day, oldest first. */
	goesBy(member: string): WordGo[];
	record(go: WordGo): void;
	close(): void;
}

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
		close() {
			if (owned) db.close();
		}
	};
}
