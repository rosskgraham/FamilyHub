import { expect, test, type Page } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

// The sample To-dos are shared by every test, and the screenshot tests run alongside these, so changes are caught
// here rather than sent: each test checks what the screen sends. The answer waits until the test lets it go, so the
// screen can be checked before it reloads.
async function catchChanges(page: Page, url = '/api/todos') {
	const sent: unknown[] = [];
	let letGo = () => {};
	const held = new Promise<void>((resolve) => (letGo = resolve));
	await page.route(url, async (route) => {
		sent.push(route.request().postDataJSON());
		await held;
		await route.fulfill({ json: { ok: true } });
	});
	return { sent, letGo };
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

test('the Today view shows To-dos due today and overdue, overdue first, saying how late', async ({ page }) => {
	await page.goto('/');
	const card = page.locator('section.todos');
	await expect(card.getByRole('heading', { name: 'To-dos' })).toBeVisible();
	const first = card.getByRole('button').first();
	await expect(first).toHaveAccessibleName('Tick off Renew the car insurance');
	await expect(first).toContainText('3 days late');
	// The overdue one, three due today (one just ticked off), and room for three rows: two, then the rest.
	await expect(card.getByRole('link', { name: '+2 more' })).toBeVisible();
	await expect(card.getByText('3 due')).toBeVisible();
});

test('ticking off a To-do strikes it through and sends the tick', async ({ page }) => {
	const { sent, letGo } = await catchChanges(page);
	await page.goto('/');
	await page.getByRole('button', { name: 'Tick off Renew the car insurance' }).click();
	await expect(page.getByRole('button', { name: 'Untick Renew the car insurance' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	expect(sent).toEqual([{ action: 'tick', id: expect.stringMatching(/^sample-todo-/), tickedOff: true }]);
	letGo();
});

test('the To-dos Section groups To-dos by when they’re due', async ({ page }) => {
	await page.goto('/todos');
	const titles = await page.locator('.group h3').allTextContents();
	expect(titles).toEqual(['Overdue', 'Today', 'Tomorrow', 'Sunday 1 November', 'No date']);
});

test('adding a one-off To-do sends it with the due date chosen', async ({ page }) => {
	const { sent, letGo } = await catchChanges(page);
	await page.goto('/todos');
	await page.getByRole('button', { name: 'Add to-do' }).click();
	await page.getByRole('textbox', { name: 'New to-do' }).fill('Book the MOT');
	await page.getByRole('button', { name: 'Tomorrow' }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect.poll(() => sent).toEqual([{ action: 'add', text: 'Book the MOT', due: '2026-10-29' }]);
	letGo();
});

test('the Today view’s Shopping card adds an item without opening the list', async ({ page }) => {
	const { sent, letGo } = await catchChanges(page, '/api/shopping');
	await page.goto('/');
	const card = page.locator('section.shopping');
	await expect(card.getByText('6 to get')).toBeVisible();
	await card.getByRole('button', { name: 'Add' }).click();
	await card.getByRole('textbox', { name: 'New item' }).fill('Oat milk');
	await card.getByRole('button', { name: 'Add', exact: true }).click();
	await expect.poll(() => sent).toEqual([{ action: 'add', text: 'Oat milk' }]);
	letGo();
	await expect(card.getByRole('link', { name: /Shopping/ })).toHaveAttribute('href', '/shopping');
});

test('a long press offers to remove a To-do, and Remove sends it', async ({ page }) => {
	const { sent, letGo } = await catchChanges(page);
	await page.goto('/todos');
	const todo = page.getByRole('button', { name: 'Tick off Clean the oven' });
	const box = (await todo.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
	await page.mouse.up();
	// A long press never ticks the To-do off as well.
	expect(sent).toEqual([]);
	await page.getByRole('button', { name: 'Remove' }).click();
	await expect.poll(() => sent).toEqual([{ action: 'remove', id: expect.stringMatching(/^sample-todo-/) }]);
	await expect(page.getByText('Clean the oven')).toHaveCount(0);
	letGo();
});

test('Keep closes the offer to remove without changing anything', async ({ page }) => {
	const { sent } = await catchChanges(page);
	await page.goto('/todos');
	const todo = page.getByRole('button', { name: 'Tick off Clean the oven' });
	const box = (await todo.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();
	await page.mouse.up();
	await page.getByRole('button', { name: 'Keep' }).click();
	await expect(page.getByRole('button', { name: 'Tick off Clean the oven' })).toBeVisible();
	expect(sent).toEqual([]);
});
