import type { OwnerId } from '#lib/household.ts';
import { readJson, writeJson } from './store.ts';

// Chosen on the setup page and kept on the Hub's disk. The repo is public,
// so these never go in it.
export interface Settings {
	/** Which Google Calendar belongs to each Member, and which is the Family calendar. */
	calendars: Record<OwnerId, string>;
	/** The Google Tasks list that is the Shopping list. */
	shoppingList?: string;
}

const SETTINGS_FILE = 'settings.json';

export async function readSettings(): Promise<Settings> {
	return (await readJson<Settings>(SETTINGS_FILE)) ?? { calendars: {} };
}

export async function writeSettings(settings: Settings): Promise<void> {
	await writeJson(SETTINGS_FILE, settings);
}
