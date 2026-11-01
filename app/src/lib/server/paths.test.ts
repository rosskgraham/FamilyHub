import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ HUB_DATA_DIR: undefined as string | undefined, HUB_CONFIG_DIR: undefined as string | undefined }));
vi.mock('$app/env/private', () => env);

const { configPath, dataPath } = await import('./paths.ts');

describe('where the Hub keeps its files', () => {
	afterEach(() => {
		env.HUB_DATA_DIR = undefined;
		env.HUB_CONFIG_DIR = undefined;
	});

	it('uses app/data and app itself on the PC, where nothing is set', () => {
		expect(dataPath('settings.json')).toBe(resolve('data', 'settings.json'));
		expect(configPath('household.json')).toBe(resolve('household.json'));
	});

	it('uses the folders it’s given, such as on the Pi’s data partition, outside the releases', () => {
		env.HUB_DATA_DIR = '/var/lib/familyhub/data';
		env.HUB_CONFIG_DIR = '/var/lib/familyhub';
		expect(dataPath('hub.db')).toBe(resolve('/var/lib/familyhub/data', 'hub.db'));
		expect(configPath('chores.json')).toBe(resolve('/var/lib/familyhub', 'chores.json'));
	});

	it('gives the folder itself when asked for no file', () => {
		env.HUB_DATA_DIR = join('some', 'where');
		expect(dataPath()).toBe(resolve('some', 'where'));
	});
});
