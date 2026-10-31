import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { HalfHourUse } from '#lib/energy.ts';

// Half-hours of House use and Car charging, added up from the Zappi's history. A cache, not the Hub's own data: it can
// all be fetched again from myenergi, so it's in its own database, away from the nightly backup (ADR 0007).

export interface UsageStore {
	/** The Half-hours starting from `from` and before `to`, in time order. */
	between(from: Date, to: Date): HalfHourUse[];
	/** Adds or replaces Half-hours. One with fewer minutes than already kept is ignored, so a partial fetch can't undo a full one. */
	save(halves: (HalfHourUse & { minutes: number })[]): void;
	close(): void;
}

// Each step brings the database up to the next version; `user_version` says how far it's got.
const MIGRATIONS = [
	`CREATE TABLE half_hours (
		start TEXT PRIMARY KEY,
		house REAL NOT NULL,
		car REAL NOT NULL,
		minutes INTEGER NOT NULL
	);`
];

/** Opens the database at `path`, creating and upgrading it as needed. `:memory:` keeps it in memory. */
export function openUsageStore(path: string): UsageStore {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode = WAL;');
	const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = version; v < MIGRATIONS.length; v++) {
		db.exec('BEGIN');
		db.exec(MIGRATIONS[v]!);
		db.exec(`PRAGMA user_version = ${v + 1}`);
		db.exec('COMMIT');
	}

	const select = db.prepare('SELECT start, house, car FROM half_hours WHERE start >= ? AND start < ? ORDER BY start');
	const upsert = db.prepare(
		`INSERT INTO half_hours (start, house, car, minutes) VALUES (?, ?, ?, ?)
		ON CONFLICT (start) DO UPDATE SET house = excluded.house, car = excluded.car, minutes = excluded.minutes
		WHERE excluded.minutes >= half_hours.minutes`
	);
	return {
		between(from, to) {
			const rows = select.all(from.toISOString(), to.toISOString()) as { start: string; house: number; car: number }[];
			return rows.map((r) => ({ from: r.start, house: r.house, car: r.car }));
		},
		save(halves) {
			db.exec('BEGIN');
			for (const h of halves) upsert.run(h.from, h.house, h.car, h.minutes);
			db.exec('COMMIT');
		},
		close() {
			db.close();
		}
	};
}
