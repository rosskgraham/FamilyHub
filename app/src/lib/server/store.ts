import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// What the Hub keeps on its own disk: the Google sign-in and local settings.
// Git ignores this folder, so nothing here can reach the repo.
const DATA_DIR = 'data';

export async function readJson<T>(name: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(join(DATA_DIR, name), 'utf8')) as T;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw e;
	}
}

export async function writeJson(name: string, value: unknown): Promise<void> {
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(join(DATA_DIR, name), JSON.stringify(value, null, '\t'), { mode: 0o600 });
}

export async function remove(name: string): Promise<void> {
	await rm(join(DATA_DIR, name), { force: true });
}
