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

test('chores view in the Evening theme', async ({ page }) => {
	await page.goto('/chores?theme=evening');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('chores-evening.png');
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

test('an Up for grabs job goes to whoever did it, first come', async ({ page, request }) => {
	await page.goto('/chores');
	const grabs = page.getByRole('region', { name: 'Up for grabs' });
	const leo = page.getByRole('region', { name: 'Leo’s Chores' });
	await expect(leo.getByLabel('38 Stars')).toBeVisible();

	await grabs.getByRole('button', { name: 'Done it' }).first().click();
	const who = grabs.getByRole('group', { name: 'Who did Empty the dishwasher?' });
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('chores-who-did-it.png');
	await who.getByRole('button', { name: 'Leo' }).click();
	await expect(grabs.getByRole('button', { name: 'Done by Leo. Undo?' })).toBeVisible();
	await expect(leo.getByLabel('40 Stars')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('chores-up-for-grabs.png');

	// Nobody else can take it now.
	const late = await request.post('/api/chores', { data: { child: 'maya', chore: 'dishwasher', routine: '', ticked: true } });
	expect(late.status()).toBe(409);

	await grabs.getByRole('button', { name: 'Done by Leo. Undo?' }).click();
	await grabs.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(grabs.getByRole('button', { name: 'Done it' })).toHaveCount(2);
	await expect(leo.getByLabel('38 Stars')).toBeVisible();
});
