import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test('a page that couldn’t load is tried again within a minute', async ({ page }) => {
	await page.clock.install({ time: new Date(NOW) });
	// Once the scripts have loaded, so tapping Week asks for its data rather than loading a whole new page.
	await page.goto('/', { waitUntil: 'networkidle' });

	// The Week view's data fails to load on the server, answered the way SvelteKit answers it: every time, as the Hub
	// also asks for it on hover.
	const week = '**/week/__data.json*';
	const failed = {
		type: 'data',
		nodes: [{ type: 'skip' }, { type: 'error', error: { message: 'Internal Error' }, status: 500 }]
	};
	await page.route(week, (route) => route.fulfill({ json: failed }));
	await page.getByRole('link', { name: 'Week' }).click();
	await expect(page.getByText('This page couldn’t load')).toBeVisible();

	// The problem clears, and the next check for changes shows the page.
	await page.unroute(week);
	await page.clock.fastForward('01:00');
	await expect(page.getByText('This week')).toBeVisible();
	await expect(page.getByText('This page couldn’t load')).toBeHidden();
});
