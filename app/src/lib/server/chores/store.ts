import { backup, type DatabaseSync } from 'node:sqlite';
import type { ChoreEvent } from '#lib/chores.ts';
import { openHubDatabase } from '../hub-db.ts';

// The Hub's own data, as ADR 0006 describes: a record of what happened, in SQLite.

export interface ChoreStore {
	/** Everything that's happened, oldest first. */
	events(): ChoreEvent[];
	record(event: ChoreEvent): void;
	/** Copies the whole database to `path`, consistent even while Chores are being ticked. */
	backup(path: string): Promise<void>;
	close(): void;
}

/**
 * The Chores' record in the Hub's database: the open one, or a new one at `path`, created and upgraded as needed.
 * `:memory:` keeps it in memory. Closing only closes a database it opened itself.
 */
export function openChoreStore(at: string | DatabaseSync): ChoreStore {
	const owned = typeof at === 'string';
	const db = owned ? openHubDatabase(at) : at;

	const select = db.prepare('SELECT at, day, child, chore, routine, ticked, stars FROM chore_events ORDER BY id');
	const insert = db.prepare(
		'INSERT INTO chore_events (at, day, child, chore, routine, ticked, stars) VALUES (?, ?, ?, ?, ?, ?, ?)'
	);
	return {
		events() {
			return (select.all() as (Omit<ChoreEvent, 'ticked'> & { ticked: number })[]).map((row) => ({
				...row,
				ticked: row.ticked === 1
			}));
		},
		record(e) {
			insert.run(e.at, e.day, e.child, e.chore, e.routine, e.ticked ? 1 : 0, e.stars);
		},
		async backup(path) {
			await backup(db, path);
		},
		close() {
			if (owned) db.close();
		}
	};
}
