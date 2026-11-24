import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW: Wednesday 28 October 2026.
	await page.clock.setFixedTime(new Date(NOW));
});

test('the Week view is the next 7 days, today first', async ({ page }) => {
	await page.goto('/week');
	await expect(page.locator('.label-title')).toHaveText('Next 7 days');
	await expect(page.locator('.label-range')).toHaveText('28 October – 3 November');
	const days = page.locator('.columns .day .head .name');
	await expect(days).toHaveText(['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue']);
	await expect(page.locator('.columns .day').first()).toHaveClass(/today/);
	await expect(page.locator('.columns .day.past')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Back to today' })).toHaveCount(0);
});

test('the arrows step a week from today, and Back to today returns', async ({ page }) => {
	await page.goto('/week');
	await page.getByRole('link', { name: 'Next week' }).click();
	await expect(page.locator('.label-title')).toHaveText('In 1 week');
	await expect(page.locator('.label-range')).toHaveText('4–10 November');

	await page.getByRole('link', { name: 'Next week' }).click();
	await expect(page.locator('.label-title')).toHaveText('In 2 weeks');

	await page.getByRole('link', { name: 'Back to today' }).click();
	await expect(page).toHaveURL(/\/week$/);
	await expect(page.locator('.label-title')).toHaveText('Next 7 days');

	await page.getByRole('link', { name: 'Previous week' }).click();
	await expect(page.locator('.label-title')).toHaveText('1 week ago');
	await expect(page.locator('.label-range')).toHaveText('21–27 October');
	await expect(page.locator('.columns .day.past')).toHaveCount(7);

	await page.getByRole('link', { name: 'Previous week' }).click();
	await expect(page.locator('.label-title')).toHaveText('2 weeks ago');
	await expect(page.getByRole('link', { name: 'Back to today' })).toBeVisible();
});
