import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canCheckForUpdates, readUpdateStatus, requestUpdate } from './update.ts';

// A temporary folder for each test, so nothing here touches app/data or the Pi's updater.
let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'update-'));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('canCheckForUpdates', () => {
	it('is offered on a release, and on a development build only when the e2e tests say to', () => {
		expect(canCheckForUpdates(true, false)).toBe(true);
		expect(canCheckForUpdates(false, false)).toBe(false);
		expect(canCheckForUpdates(false, true)).toBe(true);
	});
});

describe('requestUpdate', () => {
	it('writes the time it was asked to the trigger file, which the path unit watches', async () => {
		const file = join(dir, 'update-requested');
		const asked = await requestUpdate(file, new Date('2026-11-27T10:00:00Z'));
		expect(asked).toBe('2026-11-27T10:00:00.000Z');
		expect(await readFile(file, 'utf8')).toBe('2026-11-27T10:00:00.000Z\n');

		// Asking again writes it again, which is what starts the updater.
		await requestUpdate(file, new Date('2026-11-27T10:05:00Z'));
		expect(await readFile(file, 'utf8')).toBe('2026-11-27T10:05:00.000Z\n');
	});
});

describe('readUpdateStatus', () => {
	it('reads what the updater wrote', async () => {
		const file = join(dir, 'status.json');
		await writeFile(
			file,
			JSON.stringify({ state: 'installed', version: '2026.11.27.4', message: '', at: '2026-11-27T10:01:00.000Z' })
		);
		expect(await readUpdateStatus(file)).toEqual({
			state: 'installed',
			version: '2026.11.27.4',
			message: '',
			at: '2026-11-27T10:01:00.000Z'
		});
	});

	it('has nothing when the updater has never run, as on a PC, or wrote something unexpected', async () => {
		expect(await readUpdateStatus(join(dir, 'missing.json'))).toBeNull();
		await writeFile(join(dir, 'odd.json'), '{"state":"exploded","at":"2026-11-27T10:01:00Z"}');
		expect(await readUpdateStatus(join(dir, 'odd.json'))).toBeNull();
		await writeFile(join(dir, 'half.json'), '{"state":"inst');
		expect(await readUpdateStatus(join(dir, 'half.json'))).toBeNull();
	});
});
