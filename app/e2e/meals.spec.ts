import { expect, test, type Page } from '@playwright/test';
import { HEATING_URL, NOW } from '../playwright.config.ts';

// The Meals Section (AB#98). The sample meals are shared with the screenshot tests, so on the main test Hub changes are
// caught rather than sent. The one test that really adds a meal uses the third test Hub, whose sample meals nothing
// else looks at.
async function catchChanges(page: Page) {
	const sent: unknown[] = [];
	await page.route('/api/meals', async (route) => {
		sent.push(route.request().postDataJSON());
		await route.fulfill({ json: { ok: true } });
	});
	return sent;
}

const keyboard = (page: Page) => page.getByRole('group', { name: 'On-screen keyboard' });
// Letters show as capitals at the start of a box, so keys are found whatever their case.
const key = (page: Page, name: string) => {
	const named = (n: string) => keyboard(page).getByRole('button', { name: n, exact: true });
	return named(name.toLowerCase()).or(named(name.toUpperCase())).first();
};
async function type(page: Page, text: string) {
	for (const c of text) await key(page, c === ' ' ? 'space' : c).click();
}

const editor = (page: Page) => page.getByRole('dialog');

async function openMeal(page: Page, name: string) {
	await page.goto('/meals', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
	await expect(editor(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

test('the bottom bar has a Meals tab after Shopping, marked current in the Meals Section', async ({ page }) => {
	await page.goto('/meals');
	const tabs = page.getByRole('navigation', { name: 'Views' }).getByRole('link');
	const labels = await tabs.allTextContents();
	expect(labels.indexOf('Meals')).toBe(labels.indexOf('Shopping') + 1);
	await expect(page.getByRole('link', { name: 'Meals' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('link', { name: 'Shopping' })).not.toHaveAttribute('aria-current', 'page');
});

test('the Section lists the saved meals A–Z with their ingredients, or none', async ({ page }) => {
	await page.goto('/meals');
	const meals = page.getByRole('region', { name: 'Saved meals' }).getByRole('list').getByRole('button');
	await expect(meals).toHaveCount(12);
	await expect(meals.first()).toHaveText(/Chicken curry\s*6 ingredients · chicken thighs, onions, curry paste…/);
	await expect(meals.last()).toHaveText(/Takeaway\s*No ingredients/);
	await expect(page.getByText('12 meals · tap one to edit')).toBeVisible();
});

test.describe('on a Hub of its own', () => {
	test.use({ baseURL: HEATING_URL });

	test('Add meal, typed with the keyboard, Return between ingredients, adds it with one add_meal', async ({ page }) => {
		const posts: unknown[] = [];
		page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/meals') && posts.push(r.postDataJSON()));
		await page.goto('/meals', { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: 'Add meal' }).click();
		await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();

		await type(page, 'fish tacos');
		await keyboard(page).getByRole('button', { name: 'Next' }).click();
		for (const [i, ingredient] of ['tortillas', 'cod', 'limes'].entries()) {
			await expect(page.getByRole('textbox', { name: `Ingredient ${i + 1}` })).toBeFocused();
			await type(page, ingredient);
			await keyboard(page).getByRole('button', { name: 'Next' }).click();
		}
		// Return on the last opens another, which is dropped if it's left empty.
		await expect(page.getByRole('textbox', { name: 'Ingredient 4' })).toBeFocused();
		await editor(page).getByRole('button', { name: 'Done' }).click();

		await expect(editor(page)).toHaveCount(0);
		expect(posts).toEqual([{ action: 'add', name: 'Fish tacos', ingredients: ['Tortillas', 'Cod', 'Limes'] }]);
		await expect(page.getByRole('button', { name: /^Fish tacos/ })).toHaveText(/3 ingredients · Tortillas, Cod, Limes/);
	});
});

test('editing a meal renames it, renames an ingredient and removes one, then Done sends the whole new list', async ({
	page
}) => {
	const sent = await catchChanges(page);
	await openMeal(page, 'Chilli con carne');

	await page.getByRole('textbox', { name: 'Name' }).fill('Chilli');
	await editor(page).getByRole('button', { name: 'kidney beans', exact: true }).click();
	await page.getByRole('textbox', { name: 'Ingredient 2' }).fill('black beans');
	await editor(page).getByRole('button', { name: 'Remove rice' }).click();
	await editor(page).getByRole('button', { name: 'Done' }).click();

	await expect.poll(() => sent).toHaveLength(1);
	expect(sent).toEqual([
		{
			action: 'edit',
			id: expect.stringMatching(/^sample-meal-/),
			name: 'Chilli',
			ingredients: ['beef mince', 'black beans', 'chopped tomatoes', 'onions', 'peppers', 'sour cream', 'cheddar']
		}
	]);
	await expect(editor(page)).toHaveCount(0);
});

test('Cancel drops the changes and sends nothing', async ({ page }) => {
	const sent = await catchChanges(page);
	await openMeal(page, 'Fish pie');
	await page.getByRole('textbox', { name: 'Name' }).fill('Fish pie for six');
	await editor(page).getByRole('button', { name: 'Remove milk' }).click();

	await editor(page).getByRole('button', { name: 'Cancel' }).click();

	await expect(editor(page)).toHaveCount(0);
	expect(sent).toEqual([]);
	await expect(page.getByRole('button', { name: /^Fish pie/ })).toHaveText(/6 ingredients/);
});

test('Remove meal asks first, naming the day it’s planned for, and sends remove_meal only once confirmed', async ({
	page
}) => {
	const sent = await catchChanges(page);
	await openMeal(page, 'Chilli con carne');

	await editor(page).getByRole('button', { name: 'Remove meal' }).click();
	const ask = page.getByRole('alertdialog');
	await expect(ask).toContainText('Remove Chilli con carne?');
	// The sample plans it two days on: Friday, as the tests' clock is a Wednesday.
	await expect(ask).toContainText('It’s planned for Friday 30 October, which will be empty.');
	await ask.getByRole('button', { name: 'Keep' }).click();
	await expect(ask).toHaveCount(0);
	expect(sent).toEqual([]);

	await editor(page).getByRole('button', { name: 'Remove meal' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Remove meal' }).click();
	await expect.poll(() => sent).toEqual([{ action: 'remove', id: expect.stringMatching(/^sample-meal-/) }]);
	await expect(editor(page)).toHaveCount(0);
});

test('removing a meal that isn’t planned doesn’t mention a day', async ({ page }) => {
	await catchChanges(page);
	// Stir fry isn't in the sample plan.
	await openMeal(page, 'Stir fry');
	await editor(page).getByRole('button', { name: 'Remove meal' }).click();
	await expect(page.getByRole('alertdialog')).toContainText('It goes from the saved meals for everyone.');
});

// Board B: editing a meal, renaming an ingredient with the keyboard, in each theme.
for (const theme of ['day', 'evening']) {
	test(`the meal editor in the ${theme === 'day' ? 'Day' : 'Evening'} theme`, async ({ page }) => {
		await page.goto(`/meals?theme=${theme}`, { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: /^Chilli con carne/ }).click();
		await editor(page).getByRole('button', { name: 'kidney beans', exact: true }).click();
		await expect(keyboard(page)).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot(`meal-editor${theme === 'day' ? '' : '-evening'}.png`);
	});
}
