import type { OwnerId } from '#lib/household.ts';
import { validSleepHours, type SleepHours } from '#lib/sleep.ts';
import { DEFAULT_THEME_CHOICE, themeChoices, type ThemeChoice } from '#lib/theme.ts';
import { clockFormats, DEFAULT_CLOCK_FORMAT, type ClockFormat } from '#lib/time.ts';
import { getSetting, hubDatabase, setSetting } from './hub-db.ts';

// Chosen in Settings and kept in the Hub's database (ADR 0012). The repo is public, so these never go in it.
export interface Settings {
	/** Which Google Calendar belongs to each Member, and which is the Family calendar. */
	calendars: Record<OwnerId, string>;
	/** The Google Tasks list of the Household's To-dos. */
	todoList?: string;
	/** The Google Calendar of friends' and family's birthdays, shown as everyone's. */
	birthdays?: string;
	/** How times are shown, chosen on the Settings page. 24 hours unless chosen otherwise. */
	clockFormat?: ClockFormat;
	/** Light, Dark, or Auto (the Day theme until sunset), chosen on the Settings page. Auto unless chosen otherwise. */
	theme?: ThemeChoice;
	/** When the Hub sleeps, and when its screen is dark. The defaults unless chosen otherwise. */
	sleepHours?: SleepHours;
}

/** Each setting's own key in the database, so saving one never touches another. */
export const SETTING_KEYS = ['calendars', 'todoList', 'birthdays', 'clockFormat', 'theme', 'sleepHours'] as const;

export async function readSettings(): Promise<Settings> {
	const db = hubDatabase();
	const settings: Settings = { calendars: getSetting(db, 'calendars') ?? {} };
	for (const key of SETTING_KEYS.slice(1) as Exclude<(typeof SETTING_KEYS)[number], 'calendars'>[]) {
		const value = getSetting<string>(db, key);
		if (value !== undefined) (settings as unknown as Record<string, string>)[key] = value;
	}
	return settings;
}

/** Saves every setting given; one left out or undefined is cleared. */
export async function writeSettings(settings: Settings): Promise<void> {
	const db = hubDatabase();
	for (const key of SETTING_KEYS) setSetting(db, key, settings[key]);
}

/** The clock format chosen in Settings, or the 24-hour default. */
export async function readClockFormat(): Promise<ClockFormat> {
	const chosen = (await readSettings()).clockFormat;
	return chosen && clockFormats.includes(chosen) ? chosen : DEFAULT_CLOCK_FORMAT;
}

/** The theme chosen in Settings, or Auto. */
export async function readThemeChoice(): Promise<ThemeChoice> {
	const chosen = (await readSettings()).theme;
	return chosen && themeChoices.includes(chosen) ? chosen : DEFAULT_THEME_CHOICE;
}

/** The Sleep and Lights out hours chosen in Settings, or the defaults. */
export async function readSleepHours(): Promise<SleepHours> {
	return validSleepHours((await readSettings()).sleepHours);
}
