// What the Hub's SQLite databases share: work done all or nothing, and upgrades run once each.
import type { DatabaseSync } from 'node:sqlite';

/**
 * Does `work` all or nothing. If it fails partway, everything it did is undone and the error passed on, and the
 * database is left ready for the next write. Without the rollback, every later write would fail until a restart.
 */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
	db.exec('BEGIN');
	try {
		const result = work();
		db.exec('COMMIT');
		return result;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

/** Runs the migrations the database hasn't had yet, each in its own transaction, recording each in `user_version`. */
export function migrate(db: DatabaseSync, migrations: string[]): void {
	const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = version; v < migrations.length; v++) {
		transaction(db, () => {
			db.exec(migrations[v]!);
			db.exec(`PRAGMA user_version = ${v + 1}`);
		});
	}
}
