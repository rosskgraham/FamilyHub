import { expect, test, type Page } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

// Regulars in the Shopping Section (AB#110). The sample regulars and list are shared by every test, and the screenshot
// tests run alongside these, so changes are caught here rather than sent: each test checks what the screen sends.
async function catchChanges(page: Page) {
	const sent: unknown[] = [];
	await page.route('/api/shopping/regulars', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		sent.push(route.request().postDataJSON());
		await route.fulfill({ json: { ok: true } });
	});
	return sent;
}

async function openRegulars(page: Page) {
	await page.goto('/shopping', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Regulars' }).click();
	const panel = page.getByRole('dialog', { name: 'Regulars' });
	await expect(panel.getByRole('button', { name: 'Bread', exact: true })).toBeVisible();
	return panel;
}

async function pressLong(page: Page, name: string) {
	const tile = page.getByRole('button', { name, exact: true });
	const box = (await tile.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect(page.getByRole('alertdialog')).toBeVisible();
	await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

test('Regulars beside Add item opens up to 24 regulars, nothing ticked, leaving out what’s on the list', async ({
	page
}) => {
	await page.goto('/shopping', { waitUntil: 'networkidle' });
	await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
	await page.getByRole('button', { name: 'Regulars' }).click();

	const panel = page.getByRole('dialog', { name: 'Regulars' });
	const tiles = panel.getByRole('list').getByRole('button');
	await expect(tiles).toHaveCount(24);
	await expect(tiles.first()).toHaveAccessibleName('Bread');
	await expect(panel.locator('[aria-pressed="true"]')).toHaveCount(0);
	// Cheddar is a regular, but it's on the sample list already.
	await expect(panel.getByRole('button', { name: 'Cheddar', exact: true })).toHaveCount(0);
	await expect(panel.getByRole('button', { name: 'Add to Shopping' })).toBeDisabled();
});

test('ticking three and Add 3 adds them, closes the panel and says so', async ({ page }) => {
	const sent = await catchChanges(page);
	const panel = await openRegulars(page);
	for (const name of ['Kitchen roll', 'Bread', 'Cereal'])
		await panel.getByRole('button', { name, exact: true }).click();
	await expect(panel.getByRole('button', { name: 'Bread', exact: true })).toHaveAttribute('aria-pressed', 'true');

	await panel.getByRole('button', { name: 'Add 3 to Shopping' }).click();

	// In the order the panel shows them, best first.
	await expect.poll(() => sent).toEqual([{ action: 'add', names: ['Bread', 'Kitchen roll', 'Cereal'] }]);
	await expect(panel).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveText('Added 3 to Shopping');
});

test('a tile ticked twice is unticked, and Cancel adds nothing', async ({ page }) => {
	const sent = await catchChanges(page);
	const panel = await openRegulars(page);
	const bread = panel.getByRole('button', { name: 'Bread', exact: true });
	await bread.click();
	await bread.click();
	await expect(bread).toHaveAttribute('aria-pressed', 'false');
	await panel.getByRole('button', { name: 'Apples', exact: true }).click();

	await panel.getByRole('button', { name: 'Cancel' }).click();

	await expect(panel).toHaveCount(0);
	expect(sent).toEqual([]);
	await expect(page.getByRole('status')).toHaveCount(0);
});

test('a long press asks before stopping a suggestion, and Stop suggesting sends it and takes it out', async ({
	page
}) => {
	const sent = await catchChanges(page);
	const panel = await openRegulars(page);
	await pressLong(page, 'Kitchen roll');

	const ask = page.getByRole('alertdialog');
	await expect(ask).toContainText('Stop suggesting Kitchen roll?');
	// A long press never ticks it as well.
	await expect(panel.getByRole('button', { name: 'Kitchen roll', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await ask.getByRole('button', { name: 'Stop suggesting' }).click();

	await expect.poll(() => sent).toEqual([{ action: 'dont_suggest', name: 'Kitchen roll' }]);
	await expect(panel.getByRole('button', { name: 'Kitchen roll', exact: true })).toHaveCount(0);
	await expect(ask).toHaveCount(0);
});

test('Keep closes the question without changing anything', async ({ page }) => {
	const sent = await catchChanges(page);
	const panel = await openRegulars(page);
	await pressLong(page, 'Kitchen roll');

	await page.getByRole('alertdialog').getByRole('button', { name: 'Keep' }).click();

	await expect(page.getByRole('alertdialog')).toHaveCount(0);
	await expect(panel.getByRole('button', { name: 'Kitchen roll', exact: true })).toBeVisible();
	expect(sent).toEqual([]);
});

test('with no regulars yet, the panel says there’s nothing to suggest, and Add item still works', async ({ page }) => {
	await page.route('/api/shopping/regulars', (route) => route.fulfill({ json: { names: [], offline: false } }));
	await page.goto('/shopping', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Regulars' }).click();

	const panel = page.getByRole('dialog', { name: 'Regulars' });
	await expect(panel.getByText('Nothing to suggest yet')).toBeVisible();
	await expect(panel.getByRole('button', { name: 'Add to Shopping' })).toBeDisabled();
	await panel.getByRole('button', { name: 'Cancel' }).click();

	await page.getByRole('button', { name: 'Add item' }).click();
	await expect(page.getByRole('textbox', { name: 'New item' })).toBeFocused();
});

test('offline, the panel shows the last regulars fetched and says so', async ({ page }) => {
	await page.route('/api/shopping/regulars', (route) =>
		route.fulfill({ json: { names: ['Bread', 'Apples'], offline: true } })
	);
	const panel = await openRegulars(page);
	await expect(panel.getByText('Offline · the last ones fetched')).toBeVisible();
	await expect(panel.getByRole('list').getByRole('button')).toHaveCount(2);
});

// The panel, three ticked, as on the mockup's board B, in each theme.
for (const theme of ['day', 'evening']) {
	test(`the Regulars panel in the ${theme === 'day' ? 'Day' : 'Evening'} theme`, async ({ page }) => {
		await page.goto(`/shopping?theme=${theme}`, { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: 'Regulars' }).click();
		const panel = page.getByRole('dialog', { name: 'Regulars' });
		for (const name of ['Bread', 'Kitchen roll', 'Cereal'])
			await panel.getByRole('button', { name, exact: true }).click();
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot(`regulars${theme === 'day' ? '' : '-evening'}.png`);
	});
}
