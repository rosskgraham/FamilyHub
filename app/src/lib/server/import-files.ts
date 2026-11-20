import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { household as toHousehold } from '#lib/household.ts';
import { parseChores } from './chores/config.ts';
import { getSetting, hubDatabase, setSetting } from './hub-db.ts';
import { householdConfig, parseHousehold, saveHousehold } from './household.ts';
import { configPath, dataPath } from './paths.ts';
import { SETTING_KEYS } from './settings.ts';

// Before ADR 0012, the Household and Chores were files from the Key Vault, and the Calendar choices a file in the data
// folder. On first start, the Hub copies them into its database, keeping the ids they gave, so no Stars or Calendar
// choices are lost. After that the files are ignored.

const IMPORTED = 'importedFilesAt';

interface Folders {
	/** Where settings.json is: the data folder. */
	data: string;
	/** Where household.json and chores.json are: the config folder. */
	config: string;
}

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

/**
 * Imports the old files once. A file that can't be read is left for the next start, and said so in the log, so the
 * Hub still starts. Gives back what it imported, for the log and the tests.
 */
export function importOldFiles(
	db: DatabaseSync = hubDatabase(),
	folders: Folders = { data: dataPath(), config: configPath('.') }
): string[] {
	if (getSetting(db, IMPORTED)) return [];
	const imported: string[] = [];
	let failed = false;
	const attempt = (file: string, work: () => boolean) => {
		try {
			if (work()) imported.push(file);
		} catch (e) {
			failed = true;
			// SvelteKit's errors keep their words in `body`.
			const reason = (e as { body?: { message?: string } }).body?.message ?? (e as Error).message;
			console.error(`Couldn't import ${file}, so it'll be tried again at the next start: ${reason}`);
		}
	};

	attempt('settings.json', () => {
		const text = read(join(folders.data, 'settings.json'));
		if (text === null) return false;
		const old = JSON.parse(text) as Record<string, unknown>;
		for (const key of SETTING_KEYS)
			if (old[key] !== undefined && getSetting(db, key) === undefined) setSetting(db, key, old[key]);
		return true;
	});

	attempt('household.json', () => {
		const text = read(join(folders.config, 'household.json'));
		if (text === null || householdConfig(db).members.length > 0) return false;
		const { members, everyone } = parseHousehold(text);
		saveHousehold(members, everyone, db);
		return true;
	});

	// After the Household, as Chores name its Members.
	attempt('chores.json', () => {
		const text = read(join(folders.config, 'chores.json'));
		const { members, everyone } = householdConfig(db);
		if (text === null || members.length === 0 || getSetting(db, 'chores') !== undefined) return false;
		setSetting(db, 'chores', parseChores(text, toHousehold(members, everyone)));
		return true;
	});

	if (!failed) setSetting(db, IMPORTED, new Date().toISOString());
	if (imported.length > 0) console.log(`Imported ${imported.join(', ')} into the Hub's database (ADR 0012).`);
	return imported;
}
