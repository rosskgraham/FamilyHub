import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HEATING_URL, NOW, UPDATE_REQUESTED, UPDATE_STATUS } from '../playwright.config.ts';

// Check for updates in About this Hub (AB#105). The e2e build is a development build, which can't update. The third
// Hub offers it as a release would, and the tests play the Pi's updater by writing its status.json. What each step
// says is tested in src/lib/update-status.test.ts.

/** NOW and the given seconds after it, as the Hub's server sees the time. */
const after = (seconds: number) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();

function updaterSays(state: string, version: string, seconds: number) {
	mkdirSync(dirname(UPDATE_STATUS), { recursive: true });
	writeFileSync(UPDATE_STATUS, JSON.stringify({ state, version, message: '', at: after(seconds) }));
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

test.afterEach(() => {
	rmSync(UPDATE_STATUS, { force: true });
	rmSync(UPDATE_REQUESTED, { force: true });
});

test('a development build shows Check for updates, but it can’t be pressed', async ({ page }) => {
	await page.goto('/settings');
	const about = page.getByRole('region', { name: 'About this Hub' });
	await expect(about.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
	await expect(about).toContainText('Only on a release, not a development build.');
});

test('Check for updates asks the updater, shows how it goes, and Load now loads the new version', async ({ page }) => {
	updaterSays('up-to-date', '2026.10.28.1', -600);
	await page.goto(`${HEATING_URL}/settings`, { waitUntil: 'networkidle' });
	const about = page.getByRole('region', { name: 'About this Hub' });
	await expect(about.getByRole('status')).toContainText('Up to date: 2026.10.28.1');

	// The first press writes the request the Pi's path unit watches, and waits for the updater.
	await about.getByRole('button', { name: 'Check for updates' }).click();
	await expect(page).toHaveURL(`${HEATING_URL}/settings`);
	await expect(about.getByRole('status')).toHaveText('Asking the Pi to check…');
	await expect(about.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
	expect(readFileSync(UPDATE_REQUESTED, 'utf8').trim()).toBe(after(0));

	updaterSays('installing', '2026.10.28.2', 1);
	await expect(about.getByRole('status')).toContainText('Installing 2026.10.28.2…');

	// SvelteKit asks /_app/version.json whether there's a new version: once installed, it's told there is.
	await page.route('**/_app/version.json', (route) => route.fulfill({ json: { version: '2026.10.28.2' } }));
	updaterSays('installed', '2026.10.28.2', 2);
	await expect(about.getByRole('status')).toContainText('Installed 2026.10.28.2');
	await expect(about.getByRole('button', { name: 'Check for updates' })).toBeEnabled();

	// The second press loads it straight away, without waiting for the Hub to be left alone.
	await expect(about).toContainText('A new version is installed.');
	const reloaded = page.waitForEvent('load');
	await about.getByRole('button', { name: 'Load now' }).click();
	await reloaded;
	await expect(about.getByRole('button', { name: 'Load now' })).toHaveCount(0);
});

// About this Hub with both buttons and the status line, as after a check has installed a release.
for (const [name, query] of [
	['settings-updates', ''],
	['settings-updates-evening', '?theme=evening']
]) {
	test(`${name} view`, async ({ page }) => {
		updaterSays('installed', '2026.10.28.2', -60);
		await page.route('**/_app/version.json', (route) => route.fulfill({ json: { version: '2026.10.28.2' } }));
		// Pressed before the page has hydrated, the form would post without the page's ?theme.
		await page.goto(`${HEATING_URL}/settings${query}`, { waitUntil: 'networkidle' });
		const about = page.getByRole('region', { name: 'About this Hub' });
		await page.addStyleTag({ content: '.varies { visibility: hidden; }' });
		await about.getByRole('button', { name: 'Check for updates' }).click();
		updaterSays('installed', '2026.10.28.2', 1);
		await expect(about.getByRole('button', { name: 'Load now' })).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await expect(about).toHaveScreenshot(`${name}.png`);
	});
}
