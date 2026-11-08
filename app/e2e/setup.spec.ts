import { expect, test } from '@playwright/test';

// Signed in, the setup page is taller than the screen. CI has no Google sign-in, so the test
// makes the page tall itself, then checks its end can be scrolled into view.
test('the setup page scrolls when it is taller than the screen', async ({ page }) => {
	await page.goto('/setup');
	await page.locator('.setup').evaluate((setup) => {
		const filler = document.createElement('div');
		filler.style.height = '2000px';
		const end = document.createElement('p');
		end.id = 'end';
		end.textContent = 'The end';
		setup.append(filler, end);
	});

	const end = page.locator('#end');
	await end.scrollIntoViewIfNeeded();
	await expect(end).toBeInViewport({ ratio: 1 });
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
