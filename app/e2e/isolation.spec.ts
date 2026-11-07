import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import config from '../playwright.config.ts';

// app/household.json, app/chores.json and app/data are the Household's own. The Hub under test
// must never read or write them, so a local run can't break on them or damage them.
test('the Hub under test has config and data folders of its own', () => {
	const server = [config.webServer].flat()[0]!;
	const app = resolve(import.meta.dirname, '..');
	for (const name of ['HUB_CONFIG_DIR', 'HUB_DATA_DIR']) {
		const dir = server.env?.[name];
		expect(dir, name).toBeTruthy();
		expect(resolve(dir!).startsWith(app), `${name} is outside app/`).toBe(false);
	}
});
