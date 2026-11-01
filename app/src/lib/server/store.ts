import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dataPath } from './paths.ts';

// What the Hub keeps on its own disk: the Google sign-in, local settings and saved answers.
// On the PC this is app/data, which Git ignores, so nothing here can reach the repo.

/** The file, or null if there isn't one. A damaged one is moved aside and read as missing, so the Hub carries on. */
export async function readJson<T>(name: string, dir = dataPath()): Promise<T | null> {
	const path = join(dir, name);
	let text: string;
	try {
		text = await readFile(path, 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw e;
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		// Kept rather than deleted, in case there's something in it worth getting back.
		const aside = `${name}.damaged-${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`;
		await rename(path, join(dir, aside));
		console.error(`${name} was damaged, so it was moved to ${aside} and the Hub carried on without it`);
		return null;
	}
}

let saves = 0;

/**
 * Saves the file in full or not at all: it's written alongside, flushed to the disk, then swapped in, so a power cut
 * leaves either the old file or the new one.
 */
export async function writeJson(name: string, value: unknown, dir = dataPath()): Promise<void> {
	await mkdir(dir, { recursive: true });
	const path = join(dir, name);
	const temp = `${path}.saving-${process.pid}-${saves++}`;
	const file = await open(temp, 'w', 0o600);
	try {
		await file.writeFile(JSON.stringify(value, null, '\t'));
		await file.sync();
	} finally {
		await file.close();
	}
	await rename(temp, path);
	await syncFolder(dir);
}

/** Flushes the swap itself to the disk. Linux allows this; Windows, where the Hub only runs in development, doesn't. */
async function syncFolder(dir: string): Promise<void> {
	let folder;
	try {
		folder = await open(dir, 'r');
		await folder.sync();
	} catch {
		// Not possible here.
	} finally {
		await folder?.close();
	}
}

export async function remove(name: string): Promise<void> {
	await rm(dataPath(name), { force: true });
}
