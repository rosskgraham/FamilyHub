import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test('two minutes untouched, the Hub goes back to the Today view', async ({ page }) => {
	await page.clock.install({ time: new Date(NOW) });
	await page.goto('/week');

	await page.clock.fastForward('01:50');
	await expect(page).toHaveURL(/\/week$/);

	// A touch anywhere starts the two minutes again.
	await page.mouse.click(960, 60);
	await page.clock.fastForward('01:50');
	await expect(page).toHaveURL(/\/week$/);

	await page.clock.fastForward('00:15');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByText('Coming up')).toBeVisible();
});
