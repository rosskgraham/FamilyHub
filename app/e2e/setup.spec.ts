import { expect, test } from '@playwright/test';

// Signed in, the setup page is taller than the screen. CI has no Google sign-in, so the test
// makes the page tall itself, then checks its end can be scrolled to above the nav bar.
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
	const endBox = await end.boundingBox();
	const navBox = await page.getByRole('navigation', { name: 'Views' }).boundingBox();
	expect(endBox!.y + endBox!.height).toBeLessThanOrEqual(navBox!.y);
});
