import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW.
	await page.clock.setFixedTime(new Date(NOW));
});

// Every spec shares one data folder and runs at the same time, so these never leave the 12-hour clock chosen: it
// would change other tests' screenshots. The 12-hour format itself is tested in src/lib/time.test.ts.

test('the gear in the bottom bar opens Settings', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Settings' }).click();
	await expect(page).toHaveURL('/settings');
	await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
});

test('Settings shows the 24-hour clock chosen, by default', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByRole('button', { name: /24-hour/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: /12-hour/ })).toHaveAttribute('aria-pressed', 'false');

	// Choosing it again saves without leaving the page.
	await page.getByRole('button', { name: /24-hour/ }).click();
	await expect(page).toHaveURL('/settings');
	await expect(page.getByRole('button', { name: /24-hour/ })).toHaveAttribute('aria-pressed', 'true');
});

test('settings view', async ({ page }) => {
	await page.goto('/settings');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('settings.png');
});

test('settings view in the Evening theme', async ({ page }) => {
	await page.goto('/settings?theme=evening');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('settings-evening.png');
});
