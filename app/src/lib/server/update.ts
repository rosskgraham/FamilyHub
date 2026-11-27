// Check for updates in Settings (AB#105). The Hub runs as its own user and the updater as root, so the Hub never
// starts it: it writes update-requested in its data folder, and familyhub-update.path starts the updater (ADR 0004).
// The updater says how it's going in status.json, which the Hub only reads.
import { HUB_UPDATE_STATUS, HUB_UPDATES_AS_RELEASE } from '$app/env/private';
import { build } from '#lib/build.ts';
import { parseUpdateStatus, type UpdateStatus } from '#lib/update-status.ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { now as serverNow } from './now.ts';
import { dataPath } from './paths.ts';

const STATUS_FILE = HUB_UPDATE_STATUS ?? '/var/lib/familyhub-update/status.json';

/** Whether Check for updates is offered: only on a release, as a development build has nothing to update. */
export function canCheckForUpdates(release = build.release, asRelease = HUB_UPDATES_AS_RELEASE): boolean {
	return release || !!asRelease;
}

/** What the updater last said, or null if it hasn't said anything, as on a PC. */
export async function readUpdateStatus(file = STATUS_FILE): Promise<UpdateStatus | null> {
	try {
		return parseUpdateStatus(await readFile(file, 'utf8'));
	} catch {
		return null;
	}
}

/** Asks the updater to check now, and says when it was asked. */
export async function requestUpdate(file = dataPath('update-requested'), now = serverNow()): Promise<string> {
	const asked = now.toISOString();
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${asked}\n`);
	return asked;
}
