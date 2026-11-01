import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test('a page that couldn’t load is tried again within a minute', async ({ page }) => {
	await page.clock.install({ time: new Date(NOW) });
	await page.goto('/');

	// The Week view's data fails once, as if the server hit a problem.
	let failures = 0;
	await page.route('**/week/__data.json*', (route) => {
		if (failures++ > 0) return route.fallback();
		return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal Error"}' });
	});
	await page.getByRole('link', { name: 'Week' }).click();
	await expect(page.getByText('This page couldn’t load')).toBeVisible();

	await page.clock.fastForward('01:00');
	await expect(page.getByText('This week')).toBeVisible();
	await expect(page.getByText('This page couldn’t load')).toBeHidden();
});
