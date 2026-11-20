import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW.
	await page.clock.setFixedTime(new Date(NOW));
});

// Saturday's column is busy, so "Swimming lesson" is cut short there.
test('tapping an Event on the Week view shows its full title and times', async ({ page }) => {
	await page.goto('/week');
	await page.getByRole('button', { name: 'Swimming lesson, show details' }).click();
	const dialog = page.getByRole('dialog', { name: 'Swimming lesson' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('09:00–10:00');
	await expect(dialog).toContainText('Saturday 31 October');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('event-detail.png');

	await dialog.getByRole('button', { name: 'Close' }).click();
	await expect(dialog).toHaveCount(0);
});

test('an Event’s detail closes when tapped outside it', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Boiler service, show details' }).click();
	await expect(page.getByRole('dialog', { name: 'Boiler service' })).toBeVisible();
	await page.mouse.click(40, 540);
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an all-day Event shows it lasts all day', async ({ page }) => {
	await page.goto('/day');
	await page.getByRole('button', { name: 'Auntie Jo’s birthday, show details' }).click();
	const dialog = page.getByRole('dialog', { name: 'Auntie Jo’s birthday' });
	await expect(dialog).toContainText('All day');
	await expect(dialog).toContainText('Birthday');
});

test('event detail in the Evening theme', async ({ page }) => {
	await page.goto('/week?theme=evening');
	await page.getByRole('button', { name: 'Swimming lesson, show details' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('event-detail-evening.png');
});
