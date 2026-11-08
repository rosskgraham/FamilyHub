import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate, transaction } from './sqlite.ts';

const version = (db: DatabaseSync) =>
	(db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

describe('transaction', () => {
	it('undoes everything when it fails partway, and leaves the database usable', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('CREATE TABLE t (n INTEGER NOT NULL)');
		expect(() =>
			transaction(db, () => {
				db.exec('INSERT INTO t VALUES (1)');
				db.exec('INSERT INTO t VALUES (NULL)');
			})
		).toThrow();
		transaction(db, () => db.exec('INSERT INTO t VALUES (2)'));
		expect(db.prepare('SELECT n FROM t').all()).toEqual([{ n: 2 }]);
	});

	it('gives back what the work returns', () => {
		const db = new DatabaseSync(':memory:');
		expect(transaction(db, () => 42)).toBe(42);
	});
});

describe('migrate', () => {
	it('runs the migrations not yet run, each recorded in user_version', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db, ['CREATE TABLE a (x)']);
		migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (y)']);
		expect(version(db)).toBe(2);
	});

	it('leaves a failed migration unrun and unrecorded, so the next start tries it again', () => {
		const db = new DatabaseSync(':memory:');
		expect(() => migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (y); NOT SQL'])).toThrow();
		expect(version(db)).toBe(1);
		expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").all()).toEqual([]);
		migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (y)']);
		expect(version(db)).toBe(2);
	});
});
