import type { OwnerId } from '#lib/household.ts';
import { clockFormats, DEFAULT_CLOCK_FORMAT, type ClockFormat } from '#lib/time.ts';
import { readJson, writeJson } from './store.ts';

// Chosen on the setup page and kept on the Hub's disk. The repo is public,
// so these never go in it.
export interface Settings {
	/** Which Google Calendar belongs to each Member, and which is the Family calendar. */
	calendars: Record<OwnerId, string>;
	/** The Google Tasks list that is the Shopping list. */
	shoppingList?: string;
	/** The Google Tasks list of the Household's To-dos. */
	todoList?: string;
	/** The Google Calendar of friends' and family's birthdays, shown as everyone's. */
	birthdays?: string;
	/** How times are shown, chosen on the Settings page. 24 hours unless chosen otherwise. */
	clockFormat?: ClockFormat;
}

const SETTINGS_FILE = 'settings.json';

export async function readSettings(): Promise<Settings> {
	return (await readJson<Settings>(SETTINGS_FILE)) ?? { calendars: {} };
}

/** The clock format chosen in Settings, or the 24-hour default. */
export async function readClockFormat(): Promise<ClockFormat> {
	const chosen = (await readSettings()).clockFormat;
	return chosen && clockFormats.includes(chosen) ? chosen : DEFAULT_CLOCK_FORMAT;
}

export async function writeSettings(settings: Settings): Promise<void> {
	await writeJson(SETTINGS_FILE, settings);
}
