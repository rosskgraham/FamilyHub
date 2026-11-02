import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openChoreStore, type ChoreStore } from '../chores/store.ts';
import { SignInNeeded } from '../google/errors.ts';
import type { BackupFolder, DriveFile } from './drive.ts';

vi.mock('$app/env', () => ({ dev: false }));
vi.mock('$app/env/private', () => ({}));
const { backupDue, backupName, createBackups, KEEP, RETRY_MS } = await import('./index.ts');

const HOUR = 3600_000;

describe('backupDue', () => {
	it.each([
		['there’s never been one', '2026-11-02T09:00:00Z', null, true],
		['it’s gone 02:00 since the last one', '2026-11-02T02:00:00Z', '2026-11-01T02:05:00Z', true],
		['there’s been one since 02:00', '2026-11-02T09:00:00Z', '2026-11-02T02:05:00Z', false],
		['it’s not 02:00 yet, and there was one last night', '2026-11-02T01:30:00Z', '2026-11-01T02:05:00Z', false],
		['the Hub was off at 02:00 last night', '2026-11-02T01:30:00Z', '2026-10-31T02:05:00Z', true],
		// 02:00 in summer time is 01:00 UTC.
		['it’s gone 02:00 in summer time', '2026-07-02T01:00:00Z', '2026-07-01T01:05:00Z', true]
	])('says a backup is due when %s: %s', (_, now, lastAt, due) => {
		expect(backupDue(new Date(now), lastAt)).toBe(due);
	});
});

describe('backupName', () => {
	it.each([
		['2026-11-02T02:00:00Z', 'chores-2026-11-02-0200.db'],
		['2026-07-02T01:00:00Z', 'chores-2026-07-02-0200.db']
	])('names a backup at %s by its UK date and time', (now, name) => {
		expect(backupName(new Date(now))).toBe(name);
	});
});

/** A Drive folder in memory, which can be told to fail. */
function fakeFolder(): BackupFolder & { files: (DriveFile & { size: number })[]; failWith: Error | null } {
	const folder = {
		files: [] as (DriveFile & { size: number })[],
		failWith: null as Error | null,
		async upload(name: string, data: Uint8Array) {
			if (folder.failWith) throw folder.failWith;
			folder.files.push({ id: name, name, size: data.length });
		},
		async list() {
			return folder.files;
		},
		async remove(id: string) {
			folder.files = folder.files.filter((f) => f.id !== id);
		}
	};
	return folder;
}

describe('createBackups', () => {
	let now = Date.parse('2026-11-02T02:05:00Z');
	let dir: string;
	let chores: ChoreStore;
	let folder: ReturnType<typeof fakeFolder>;
	let saved: Map<string, unknown>;

	function backups(store: ChoreStore | null = chores) {
		return createBackups({
			store: async () => store,
			folder,
			files: {
				read: async <T>(name: string) => (saved.get(name) as T) ?? null,
				write: async (name: string, value: unknown) => void saved.set(name, value)
			},
			snapshotPath: join(dir, 'hub-backup.db'),
			clock: () => now
		});
	}

	beforeEach(() => {
		now = Date.parse('2026-11-02T02:05:00Z');
		dir = mkdtempSync(join(tmpdir(), 'familyhub-backup-'));
		chores = openChoreStore(join(dir, 'hub.db'));
		chores.record({ at: '2026-11-01T08:00:00.000Z', day: '2026-11-01', child: 'maya', chore: 'bed', routine: 'morning', ticked: true, stars: 1 });
		folder = fakeFolder();
		saved = new Map();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
		chores.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('uploads a snapshot of the Chores, and notes when', async () => {
		await backups().check();
		expect(folder.files).toEqual([{ id: 'chores-2026-11-02-0205.db', name: 'chores-2026-11-02-0205.db', size: expect.any(Number) }]);
		expect(folder.files[0]!.size).toBeGreaterThan(0);
		expect(saved.get('backup.json')).toEqual({ lastAt: '2026-11-02T02:05:00.000Z', failingSince: null, needsSignIn: false });
	});

	it('cleans up the snapshot after uploading it', async () => {
		await backups().check();
		const { readdirSync } = await import('node:fs');
		expect(readdirSync(dir).filter((f) => f.startsWith('hub-backup'))).toEqual([]);
	});

	it('backs up once a night, however often it checks', async () => {
		const b = backups();
		await b.check();
		now += 2 * HOUR;
		await b.check();
		expect(folder.files).toHaveLength(1);
		now = Date.parse('2026-11-03T02:00:00Z');
		await backups().check();
		expect(folder.files).toHaveLength(2);
	});

	it(`keeps only the newest ${KEEP}`, async () => {
		folder.files = Array.from({ length: KEEP }, (_, i) => {
			const name = `chores-2026-10-${String(10 + i).padStart(2, '0')}-0200.db`;
			return { id: name, name, size: 1 };
		});
		await backups().check();
		expect(folder.files).toHaveLength(KEEP);
		expect(folder.files.map((f) => f.name)).not.toContain('chores-2026-10-10-0200.db');
		expect(folder.files.map((f) => f.name)).toContain('chores-2026-11-02-0205.db');
	});

	it('does nothing when there are only sample Chores', async () => {
		await backups(null).check();
		expect(folder.files).toEqual([]);
		expect(saved.size).toBe(0);
	});

	it('notes a failure, and tries again an hour later rather than every check', async () => {
		const b = backups();
		folder.failWith = new TypeError('fetch failed');
		await b.check();
		expect(saved.get('backup.json')).toEqual({ lastAt: null, failingSince: '2026-11-02T02:05:00.000Z', needsSignIn: false });
		folder.failWith = null;
		now += RETRY_MS - 60_000;
		await b.check();
		expect(folder.files).toEqual([]);
		now += 60_000;
		await b.check();
		expect(folder.files).toHaveLength(1);
		expect(saved.get('backup.json')).toMatchObject({ failingSince: null });
	});

	it('says a fresh sign-in is needed when Google wants one, such as for the Drive permission', async () => {
		folder.failWith = new SignInNeeded();
		await backups().check();
		expect(saved.get('backup.json')).toMatchObject({ needsSignIn: true });
	});
});
