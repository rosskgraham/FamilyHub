import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

// These run in order: the second ticks a Chore, which changes the sample record.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

test('chores view', async ({ page }) => {
	await page.goto('/chores');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('chores.png');
});

test('finishing a Routine celebrates it', async ({ page }) => {
	await page.goto('/chores');
	const maya = page.getByRole('region', { name: 'Maya’s Chores' });
	await maya.getByRole('button', { name: 'Tick off Get dressed' }).click();

	const celebration = page.getByRole('alertdialog', { name: 'Morning done, Maya!' });
	await expect(celebration).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('chores-celebration.png');

	await celebration.getByRole('button', { name: 'Nice one!' }).click();
	await expect(celebration).toBeHidden();
	await expect(maya.getByText('Morning: all done')).toBeVisible();
	await expect(maya.getByRole('button', { name: 'Untick Get dressed' })).toBeVisible();
});
