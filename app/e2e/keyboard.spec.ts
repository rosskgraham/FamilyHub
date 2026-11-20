import { expect, test, type Page } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW.
	await page.clock.setFixedTime(new Date(NOW));
});

const keyboard = (page: Page) => page.getByRole('group', { name: 'On-screen keyboard' });
// Letters show as capitals at the start of a box, so keys are found whatever their case.
const key = (page: Page, name: string) => {
	const named = (n: string) => keyboard(page).getByRole('button', { name: n, exact: true });
	return named(name.toLowerCase()).or(named(name.toUpperCase())).first();
};

async function type(page: Page, text: string) {
	for (const c of text) await key(page, c === ' ' ? 'space' : c).click();
}

test('the keyboard types a Shopping item and adds it', async ({ page }) => {
	// The sample Shopping list is shared with the screenshot tests, so the item is caught rather than added.
	const sent: unknown[] = [];
	await page.route('/api/shopping', async (route) => {
		sent.push(route.request().postDataJSON());
		await route.fulfill({ json: { ok: true } });
	});
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'Add item' }).click();
	await expect(keyboard(page)).toBeVisible();

	await type(page, 'oat milkk');
	await keyboard(page).getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('textbox', { name: 'New item' })).toHaveValue('Oat milk');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('keyboard.png');

	// Enter is labelled with the form's own button.
	await keyboard(page).getByRole('button', { name: 'Add' }).click();
	await expect(keyboard(page)).toHaveCount(0);
	await expect.poll(() => sent).toEqual([{ action: 'add', text: 'Oat milk' }]);
});

test('the page slides up so the form stays above the keyboard', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'Add item' }).click();
	const keys = (await keyboard(page).boundingBox())!;
	// The page slides up over a fifth of a second.
	await expect
		.poll(async () => {
			const form = (await page.locator('form.add').boundingBox())!;
			return form.y + form.height;
		})
		.toBeLessThanOrEqual(keys.y);

	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(keyboard(page)).toHaveCount(0);
});

test('the symbols have a pound sign, and Hide closes the keyboard', async ({ page }) => {
	await page.goto('/todos');
	await page.getByRole('button', { name: 'Add to-do' }).click();
	await key(page, '?123').click();
	await key(page, '£').click();
	await key(page, '5').click();
	await expect(page.getByRole('textbox', { name: 'New to-do' })).toHaveValue('£5');

	await keyboard(page).getByRole('button', { name: 'Hide keyboard' }).click();
	await expect(keyboard(page)).toHaveCount(0);
});

test('keyboard in the Evening theme', async ({ page }) => {
	await page.goto('/shopping?theme=evening');
	await page.getByRole('button', { name: 'Add item' }).click();
	await expect(keyboard(page)).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('keyboard-evening.png');
});
