import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChoreEvent } from '#lib/chores.ts';

// The Hub's own data, as ADR 0006 describes: a record of what happened, in SQLite.

export interface ChoreStore {
	/** Everything that's happened, oldest first. */
	events(): ChoreEvent[];
	record(event: ChoreEvent): void;
	close(): void;
}

// Each step brings the database up to the next version; `user_version` says how far it's got.
const MIGRATIONS = [
	`CREATE TABLE chore_events (
		id INTEGER PRIMARY KEY,
		at TEXT NOT NULL,
		day TEXT NOT NULL,
		child TEXT NOT NULL,
		chore TEXT NOT NULL,
		routine TEXT NOT NULL,
		ticked INTEGER NOT NULL,
		stars INTEGER NOT NULL
	);
	CREATE INDEX chore_events_day ON chore_events (day);`
];

/** Opens the database at `path`, creating and upgrading it as needed. `:memory:` keeps it in memory. */
export function openChoreStore(path: string): ChoreStore {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	// The write-ahead log and full syncing mean a power cut can't leave the data half-written.
	db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
	const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = version; v < MIGRATIONS.length; v++) {
		db.exec('BEGIN');
		db.exec(MIGRATIONS[v]!);
		db.exec(`PRAGMA user_version = ${v + 1}`);
		db.exec('COMMIT');
	}

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
		close() {
			db.close();
		}
	};
}
