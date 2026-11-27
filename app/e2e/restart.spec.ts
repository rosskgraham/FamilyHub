import { expect, test, type Page, type Response } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

// While a release restarts the Hub, its server doesn't answer for a moment. The screen keeps what it shows rather than
// loading anything, which would land on the browser's "page not reachable" page (AB#41).

/** Counts the screen's data loads: SvelteKit's __data.json requests. */
function countDataLoads(page: Page) {
	const loads = { count: 0 };
	page.on('request', (request) => {
		if (request.url().includes('__data.json')) loads.count++;
	});
	return loads;
}

/** Refuses /api/health while down. The route stays in place, as removing it can leave a request it holds unanswered. */
async function healthSwitch(page: Page) {
	const state = { down: false };
	await page.route('**/api/health', (route) => (state.down ? route.abort('connectionrefused') : route.continue()));
	return state;
}

/**
 * Waits until the screen is running: hydrated, with its timers started, and one minute refresh done. Its idle time
 * starts when it hydrates, which can come after the page has loaded when the machine is busy.
 */
async function untilRunning(page: Page) {
	let refreshed = false;
	const seen = (response: Response) => response.url().includes('__data.json') && (refreshed = true);
	page.on('response', seen);
	await expect(async () => {
		await page.clock.fastForward('00:30');
		expect(refreshed).toBe(true);
	}).toPass({ timeout: 10_000 });
	page.off('response', seen);
}

test('the minute refresh waits while the Hub’s server doesn’t answer, then catches up', async ({ page }) => {
	await page.clock.install({ time: new Date(NOW) });
	const health = await healthSwitch(page);
	await page.goto('/');
	await untilRunning(page);
	await expect(page.getByText('Coming up')).toBeVisible();
	const loads = countDataLoads(page);

	health.down = true;
	await page.clock.fastForward('01:01');
	await page.waitForTimeout(200);
	expect(loads.count).toBe(0);
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByText('Coming up')).toBeVisible();

	health.down = false;
	const reload = page.waitForRequest((request) => request.url().includes('__data.json'));
	await page.clock.fastForward('01:00');
	await reload;
	expect(loads.count).toBeGreaterThan(0);
	await expect(page.getByText('Coming up')).toBeVisible();
});

test('going back to the Today view waits until the Hub’s server answers', async ({ page }) => {
	await page.clock.install({ time: new Date(NOW) });
	const health = await healthSwitch(page);
	await page.goto('/week');
	await untilRunning(page);

	health.down = true;
	await page.clock.fastForward('02:05');
	await page.waitForTimeout(200);
	await expect(page).toHaveURL(/\/week$/);

	// It goes once an answer comes back, at a tick of the screen's clock after that, so the clock is moved on until then.
	health.down = false;
	await expect(async () => {
		await page.clock.fastForward('00:01');
		await expect(page).toHaveURL(/\/$/, { timeout: 500 });
	}).toPass({ timeout: 10_000 });
	await expect(page.getByText('Coming up')).toBeVisible();
});
