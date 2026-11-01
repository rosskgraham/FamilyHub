import { HUB_CONFIG_DIR, HUB_DATA_DIR } from '$app/env/private';
import { resolve } from 'node:path';

// Where the Hub's files live. On the Pi each release is installed in a folder of its own (ADR 0004), so both are set
// to folders outside them, on the data partition, or every new release would start with no sign-in and no Stars.

/** What the Hub writes itself: the Google sign-in, settings, saved answers and its databases. */
export function dataPath(name = ''): string {
	return resolve(HUB_DATA_DIR ?? 'data', name);
}

/** What Alex writes by hand: household.json and chores.json. */
export function configPath(name: string): string {
	return resolve(HUB_CONFIG_DIR ?? '.', name);
}
