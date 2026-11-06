import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW.
	await page.clock.setFixedTime(new Date(NOW));
});

// Thursday is bin day in the sample data. The bin shows in the day's heading, leaving its rows for Events.
test('a bin day in Coming up shows as a bin by the date, not a row', async ({ page }) => {
	await page.goto('/');
	const thursday = page.locator('.coming .day').filter({ has: page.locator('.day-head', { hasText: 'Thu' }) });
	await expect(thursday.locator('.day-head').getByRole('img', { name: 'blue bin' })).toBeVisible();
	await expect(thursday.locator('.banner', { hasText: 'Blue bin' })).toHaveCount(0);
});
