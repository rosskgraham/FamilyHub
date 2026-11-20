import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getSetting, openHubDatabase } from './hub-db.ts';
import { householdConfig } from './household.ts';
import { importOldFiles } from './import-files.ts';

function folders(files: Record<string, unknown>) {
	const data = mkdtempSync(join(tmpdir(), 'hub-data-'));
	const config = mkdtempSync(join(tmpdir(), 'hub-config-'));
	for (const [name, value] of Object.entries(files)) {
		const dir = name === 'settings.json' ? data : config;
		writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
	}
	return { data, config };
}

const household = {
	members: [
		{ name: 'Ross', colour: 'blueberry' },
		{ name: 'Maya', colour: 'pistachio' }
	],
	everyone: { colour: 'tangerine' }
};
const chores = {
	routines: [{ id: 'morning', name: 'Morning', from: '07:00' }],
	chores: [{ id: 'teeth', name: 'Brush your teeth', icon: 'teeth', stars: 1, routines: ['morning'], who: ['Maya'] }]
};

describe('importOldFiles', () => {
	it('copies the Household, Chores and settings in, keeping the old ids', () => {
		const db = openHubDatabase(':memory:');
		const at = folders({
			'household.json': household,
			'chores.json': chores,
			'settings.json': { calendars: { ross: 'r@example.com', maya: 'i@example.com' }, clockFormat: '12h' }
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		expect(importOldFiles(db, at)).toEqual(['settings.json', 'household.json', 'chores.json']);
		expect(householdConfig(db)).toEqual({
			members: [
				{ id: 'ross', name: 'Ross', colour: 'blueberry' },
				{ id: 'maya', name: 'Maya', colour: 'pistachio' }
			],
			everyone: 'tangerine'
		});
		expect(getSetting(db, 'calendars')).toEqual({ ross: 'r@example.com', maya: 'i@example.com' });
		expect(getSetting(db, 'clockFormat')).toBe('12h');
		// Chores name Members by their ids from now on.
		expect(getSetting<{ chores: { who: string[] }[] }>(db, 'chores')?.chores[0]?.who).toEqual(['maya']);
	});

	it('only ever imports once', () => {
		const db = openHubDatabase(':memory:');
		vi.spyOn(console, 'log').mockImplementation(() => {});
		importOldFiles(db, folders({}));
		expect(importOldFiles(db, folders({ 'household.json': household }))).toEqual([]);
		expect(householdConfig(db).members).toEqual([]);
	});

	it('tries a broken file again at the next start, and still imports the rest', () => {
		const db = openHubDatabase(':memory:');
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = folders({ 'household.json': '{', 'settings.json': { clockFormat: '12h' } });
		expect(importOldFiles(db, broken)).toEqual(['settings.json']);
		expect(error).toHaveBeenCalledWith(expect.stringContaining("household.json isn't valid JSON"));
		expect(importOldFiles(db, folders({ 'household.json': household }))).toEqual(['household.json']);
	});
});
