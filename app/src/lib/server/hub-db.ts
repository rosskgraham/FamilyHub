import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataPath } from './paths.ts';
import { migrate } from './sqlite.ts';

// The Hub's own database, hub.db (ADR 0006 and ADR 0012): the Chores' record, the Household and the settings chosen
// at the Hub, backed up together every night.

// Each step brings the database up to the next version; `user_version` says how far it's got. Never change one that
// has shipped: add another.
export const MIGRATIONS = [
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
	CREATE INDEX chore_events_day ON chore_events (day);`,
	// The Household's Members, in the order they're shown. An id never changes, so a rename keeps their Calendar and
	// Stars. Settings are JSON values by name, such as the Calendar choices and the Chores' setup.
	`CREATE TABLE members (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		colour TEXT NOT NULL,
		initial TEXT,
		position INTEGER NOT NULL
	);
	CREATE TABLE settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);`
];

/** Opens the database at `path`, creating and upgrading it as needed. `:memory:` keeps it in memory. */
export function openHubDatabase(path: string): DatabaseSync {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	// The write-ahead log and full syncing mean a power cut can't leave the data half-written.
	db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
	migrate(db, MIGRATIONS);
	return db;
}

const DATABASE = 'hub.db';
let hub: DatabaseSync | undefined;

/** The Hub's database, opened on first use and kept open. */
export function hubDatabase(): DatabaseSync {
	return (hub ??= openHubDatabase(dataPath(DATABASE)));
}

/** A setting's value, or undefined if it's never been set. */
export function getSetting<T>(db: DatabaseSync, key: string): T | undefined {
	const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
	return row ? (JSON.parse(row.value) as T) : undefined;
}

/** Sets a setting, or clears it when `value` is undefined. */
export function setSetting(db: DatabaseSync, key: string, value: unknown): void {
	if (value === undefined) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
	else
		db.prepare(
			'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
		).run(key, JSON.stringify(value));
}
