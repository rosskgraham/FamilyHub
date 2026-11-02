// The nightly Chores backup to Google Drive (ADR 0006). Chores are the only data the Hub owns: everything else can be
// fetched again. It runs after 02:00, or as soon as the Hub is next on after a night it was off.
import { dev } from '$app/env';
import { addDays, dayKey, ukTime } from '#lib/time.ts';
import { readFile, rm } from 'node:fs/promises';
import { realChoreStore } from '../chores/index.ts';
import type { ChoreStore } from '../chores/store.ts';
import { googleRequest, SignInNeeded } from '../google/auth.ts';
import { dataPath } from '../paths.ts';
import { readJson, writeJson } from '../store.ts';
import { backupFolder, beyond, type BackupFolder } from './drive.ts';

export interface BackupStatus {
	/** When the last backup was made, as an ISO instant. */
	lastAt: string | null;
	/** When the backups started failing, or null if the last one worked. */
	failingSince: string | null;
	/** The sign-in is missing Drive, or has ended: signing in again on the setup page fixes it. */
	needsSignIn: boolean;
}

export interface BackupSources {
	/** The Chores' database, or null when there are only sample Chores, which aren't kept. */
	store: () => Promise<ChoreStore | null>;
	folder: BackupFolder;
	files: { read: <T>(name: string) => Promise<T | null>; write: (name: string, value: unknown) => Promise<void> };
	/** Where the snapshot is made before it's uploaded. */
	snapshotPath: string;
	/** Milliseconds since 1970. */
	clock: () => number;
}

export const KEEP = 14;
const STATUS_FILE = 'backup.json';
const CHECK_MS = 10 * 60_000;
// After a failure, how long until the next try, so a night offline doesn't mean a request every ten minutes.
export const RETRY_MS = 60 * 60_000;
// After this long without a backup, the Hub says it needs Alex.
const NEEDS_ALEX_MS = 2 * 24 * 3600_000;
const AT = '02:00';

/** Whether a backup is due: none since the last 02:00 in the UK. */
export function backupDue(now: Date, lastAt: string | null): boolean {
	const today = dayKey(now);
	const last = now >= ukTime(today, AT) ? ukTime(today, AT) : ukTime(addDays(today, -1), AT);
	return lastAt === null || Date.parse(lastAt) < last.getTime();
}

/** The backup's name in Drive, by its UK date and time, so names sort oldest first. */
export function backupName(now: Date): string {
	const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
	return `chores-${dayKey(now)}-${time.format(now).replace(':', '')}.db`;
}

export function readBackupStatus(): Promise<BackupStatus | null> {
	return readJson<BackupStatus>(STATUS_FILE);
}

/** Backs up when it's due. `check` is safe to call as often as liked. */
export function createBackups({ store, folder, files, snapshotPath, clock }: BackupSources) {
	let lastTry = -Infinity;
	let running = false;

	async function run(status: BackupStatus): Promise<void> {
		const chores = await store();
		if (!chores) return;
		const now = new Date(clock());
		try {
			await rm(snapshotPath, { force: true });
			await chores.backup(snapshotPath);
			await folder.upload(backupName(now), new Uint8Array(await readFile(snapshotPath)));
			for (const old of beyond(await folder.list(), KEEP)) await folder.remove(old.id);
			await files.write(STATUS_FILE, {
				lastAt: now.toISOString(),
				failingSince: null,
				needsSignIn: false
			} satisfies BackupStatus);
		} catch (e) {
			const failingSince = status.failingSince ?? now.toISOString();
			console.error('Chores backup failed:', e instanceof Error ? e.message : e);
			if (clock() - Date.parse(status.lastAt ?? failingSince) >= NEEDS_ALEX_MS) {
				// The line telemetry will turn into an alert for Alex (ADR 0005).
				console.error(`Chores backup failing, last one ${status.lastAt ?? 'never'}`);
			}
			await files.write(STATUS_FILE, {
				...status,
				failingSince,
				needsSignIn: e instanceof SignInNeeded
			} satisfies BackupStatus);
		} finally {
			await rm(snapshotPath, { force: true });
		}
	}

	return {
		async check(): Promise<void> {
			if (running || clock() - lastTry < RETRY_MS) return;
			const status = (await files.read<BackupStatus>(STATUS_FILE)) ?? {
				lastAt: null,
				failingSince: null,
				needsSignIn: false
			};
			if (!backupDue(new Date(clock()), status.lastAt)) return;
			running = true;
			lastTry = clock();
			try {
				await run(status);
			} finally {
				running = false;
			}
		}
	};
}

/**
 * Checks every ten minutes whether a backup is due, in the built Hub only: a dev server on a PC never uploads its
 * Chores over the Household's real backups.
 */
export function startBackups(): void {
	if (dev) return;
	const backups = createBackups({
		store: realChoreStore,
		folder: backupFolder(googleRequest),
		files: { read: readJson, write: writeJson },
		snapshotPath: dataPath('hub-backup.db'),
		clock: Date.now
	});
	const check = () => backups.check().catch((e) => console.error('Chores backup check failed:', e));
	check();
	// Never what keeps the Hub running, so it can stop when it's told to, such as for a new release.
	const timer = setInterval(check, CHECK_MS).unref();
	process.once('sveltekit:shutdown', () => clearInterval(timer));
}
