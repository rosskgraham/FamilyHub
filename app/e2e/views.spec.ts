import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW.
	await page.clock.setFixedTime(new Date(NOW));
});

const views = [
	{ name: 'today', path: '/' },
	{ name: 'day', path: '/day' },
	// A busy Saturday, with more Events than fit.
	{ name: 'day-busy', path: '/day?date=2026-10-31' },
	{ name: 'week', path: '/week' },
	{ name: 'shopping', path: '/shopping' },
	{ name: 'energy', path: '/energy' }
];

for (const { name, path } of views) {
	test(`${name} view`, async ({ page }) => {
		await page.goto(path);
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot(`${name}.png`);
	});

	// The same view after sunset.
	test(`${name} view in the Evening theme`, async ({ page }) => {
		await page.goto(`${path}${path.includes('?') ? '&' : '?'}theme=evening`);
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot(`${name}-evening.png`);
	});
}
