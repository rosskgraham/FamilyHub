import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson, writeJson } from './store.ts';

describe('the data folder', () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'familyhub-store-'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(dir, { recursive: true, force: true });
	});

	it('reads back what it wrote', async () => {
		await writeJson('settings.json', { calendars: { alex: 'a@example.com' } }, dir);
		expect(await readJson('settings.json', dir)).toEqual({ calendars: { alex: 'a@example.com' } });
	});

	it('reads a missing file as null', async () => {
		expect(await readJson('settings.json', dir)).toBeNull();
	});

	it('creates the folder if it isn’t there', async () => {
		const inner = join(dir, 'data');
		await writeJson('settings.json', { calendars: {} }, inner);
		expect(await readJson('settings.json', inner)).toEqual({ calendars: {} });
	});

	it('leaves nothing else behind, so a power cut mid-save can only leave the old file or the new one', async () => {
		await writeJson('settings.json', { calendars: {} }, dir);
		await writeJson('settings.json', { calendars: { alex: 'a' } }, dir);
		expect(await readdir(dir)).toEqual(['settings.json']);
	});

	it('keeps every save when several happen at once', async () => {
		await Promise.all([1, 2, 3].map((n) => writeJson(`file-${n}.json`, n, dir)));
		expect(await Promise.all([1, 2, 3].map((n) => readJson(`file-${n}.json`, dir)))).toEqual([1, 2, 3]);
	});

	it.each([
		['an empty file', ''],
		['half a file', '{"calendars": {"alex": "a@exa']
	])('reads %s as missing, and moves it aside for Alex to look at', async (_, text) => {
		await writeFile(join(dir, 'settings.json'), text);
		expect(await readJson('settings.json', dir)).toBeNull();
		const [aside, ...others] = await readdir(dir);
		expect(others).toEqual([]);
		expect(aside).toMatch(/^settings\.json\.damaged-\d{8}T\d{6}Z$/);
		expect(await readFile(join(dir, aside!), 'utf8')).toBe(text);
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`settings.json was damaged, so it was moved to ${aside}`));
	});
});
