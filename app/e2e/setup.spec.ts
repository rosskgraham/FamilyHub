import { expect, test } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW. Without it, from 22:00 the Hub is asleep and setup
	// can't be reached.
	await page.clock.setFixedTime(new Date(NOW));
});

// Signed in, the setup page is taller than the screen. CI has no Google sign-in, so the test makes the page tall
// itself, then scrolls to its end. It does that with a stylesheet, not by adding elements: Svelte can render the
// page again while it hydrates, which took away added elements when the machine was busy.
test('the setup page scrolls when it is taller than the screen', async ({ page }) => {
	await page.goto('/setup');
	await page.addStyleTag({ content: '.setup::after { content: ""; display: block; height: 2000px; }' });

	const setup = page.locator('.setup');
	const box = (await setup.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 5000);
	await expect
		.poll(() => setup.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
		.toBeLessThanOrEqual(1);
	expect(await setup.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('setup has no nav bar, and a way back to the Today view', async ({ page }) => {
	await page.goto('/setup');
	await expect(page.getByRole('navigation', { name: 'Views' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Back to Today' }).click();
	await expect(page).toHaveURL('/');
});

// Setup isn't one tap away, so nobody signs the Hub out of Google by accident.
test('a long press on the status opens setup', async ({ page }) => {
	await page.goto('/');
	const box = (await page.locator('footer .status').boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	// Before the finger lifts, so it's the long press and not a tap on a link.
	await expect(page).toHaveURL('/setup');
	await page.mouse.up();
});

test('every Section shows the status, so setup is a long press away from any of them', async ({ page }) => {
	for (const path of ['/shopping', '/todos', '/chores', '/energy']) {
		await page.goto(path);
		await expect(page.locator('footer .status'), path).toBeVisible();
	}
});
