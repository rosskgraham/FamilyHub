import { expect, test, type Page } from '@playwright/test';
import { HEATING_URL, NOW } from '../playwright.config.ts';

// Planning dinners (AB#99). The sample plan, relative to the tests' clock (Wednesday 28 October): Fajitas tonight,
// Takeaway tomorrow, Chilli con carne on Friday, nothing on Saturday, Spaghetti bolognese on Sunday, Fish pie on Monday
// and nothing on Tuesday. The sample is shared with the screenshot tests, so on the main test Hub changes are caught;
// the tests that check a change shows use the third test Hub, whose meals nothing else looks at.
async function catchChanges(page: Page) {
	const sent: unknown[] = [];
	await page.route('/api/meals', async (route) => {
		sent.push(route.request().postDataJSON());
		await route.fulfill({ json: { ok: true } });
	});
	return sent;
}

/** Every change the page posts, sent on as normal. */
function watchChanges(page: Page) {
	const sent: unknown[] = [];
	page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/meals') && sent.push(r.postDataJSON()));
	return sent;
}

const week = (page: Page) => page.getByRole('region', { name: 'This week' });
const day = (page: Page, label: string) => week(page).getByRole('button', { name: new RegExp(`^${label}`) });
const picker = (page: Page) => page.getByRole('dialog', { name: 'What’s for dinner?' });

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

test('the Meals Section lists tonight, tomorrow and the next 5 days, each with its dinner or nothing planned', async ({
	page
}) => {
	await page.goto('/meals');
	const days = week(page).getByRole('listitem');
	await expect(days).toHaveCount(7);
	await expect(days.nth(0)).toHaveText(/Tonight\s*Wed 28 Oct\s*Fajitas/);
	await expect(days.nth(1)).toHaveText(/Tomorrow\s*Thu 29 Oct\s*Takeaway/);
	await expect(days.nth(2)).toHaveText(/Friday\s*30 Oct\s*Chilli con carne/);
	await expect(days.nth(3)).toHaveText(/Saturday\s*31 Oct\s*Nothing planned/);
	await expect(days.nth(6)).toHaveText(/Tuesday\s*3 Nov\s*Nothing planned/);
});

test('the picker marks the meal already planned for the day', async ({ page }) => {
	await page.goto('/meals', { waitUntil: 'networkidle' });
	await day(page, 'Friday').click();
	await expect(picker(page)).toContainText('Friday 30 October');
	await expect(picker(page).getByRole('button', { name: /^Chilli con carne/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(picker(page).locator('[aria-pressed="true"]')).toHaveCount(1);
});

test('Nothing planned sends one unplan for the day, and Cancel sends nothing', async ({ page }) => {
	const sent = await catchChanges(page);
	await page.goto('/meals', { waitUntil: 'networkidle' });

	await day(page, 'Friday').click();
	await picker(page).getByRole('button', { name: 'Cancel' }).click();
	await expect(picker(page)).toHaveCount(0);
	expect(sent).toEqual([]);

	await day(page, 'Friday').click();
	await picker(page).getByRole('button', { name: 'Nothing planned' }).click();
	await expect.poll(() => sent).toEqual([{ action: 'unplan', date: '2026-10-30' }]);
	await expect(picker(page)).toHaveCount(0);
});

test.describe('on a Hub of its own', () => {
	test.use({ baseURL: HEATING_URL });

	test('tapping a day and a saved meal sends one plan for that date, and the day shows the meal', async ({ page }) => {
		const sent = watchChanges(page);
		await page.goto('/meals', { waitUntil: 'networkidle' });

		await day(page, 'Saturday').click();
		await picker(page)
			.getByRole('button', { name: /^Lasagne/ })
			.click();

		await expect(picker(page)).toHaveCount(0);
		expect(sent).toEqual([{ action: 'plan', date: '2026-10-31', mealId: expect.stringMatching(/^sample-meal-/) }]);
		await expect(day(page, 'Saturday')).toHaveText(/Lasagne/);
	});

	test('New meal from the picker, then Done, adds the meal and plans it for that day in one go', async ({ page }) => {
		const sent = watchChanges(page);
		await page.goto('/meals', { waitUntil: 'networkidle' });

		await day(page, 'Tuesday').click();
		await picker(page).getByRole('button', { name: 'New meal' }).click();
		await expect(page.getByRole('heading', { name: 'New meal for Tuesday' })).toBeVisible();
		await page.getByRole('textbox', { name: 'Name' }).fill('Pizza night');
		await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

		await expect(page.getByRole('dialog')).toHaveCount(0);
		expect(sent).toEqual([{ action: 'add', name: 'Pizza night', ingredients: [], planFor: '2026-11-03' }]);
		await expect(day(page, 'Tuesday')).toHaveText(/Pizza night/);
	});
});

test('the Today view shows tonight’s and tomorrow’s dinners between Energy and To-dos, and a tap opens Meals', async ({
	page
}) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	const card = page.getByRole('link', { name: /^Dinner tonight/ });
	await expect(card).toContainText('Fajitas');
	await expect(card).toContainText('Tomorrow · Takeaway');

	// In the right column, between the Energy card and To-dos.
	const energy = (await page.locator('aside > *').first().boundingBox())!;
	const dinner = (await card.boundingBox())!;
	const todos = (await page.locator('section.todos').boundingBox())!;
	expect(energy.y + energy.height).toBeLessThan(dinner.y);
	expect(dinner.y + dinner.height).toBeLessThan(todos.y);

	await card.click();
	await expect(page).toHaveURL(/\/meals$/);
	await expect(page.getByRole('link', { name: 'Meals' })).toHaveAttribute('aria-current', 'page');
});

// The picker, as on the mockup's board D, in each theme.
for (const theme of ['day', 'evening']) {
	test(`the dinner picker in the ${theme === 'day' ? 'Day' : 'Evening'} theme`, async ({ page }) => {
		await page.goto(`/meals?theme=${theme}`, { waitUntil: 'networkidle' });
		await day(page, 'Sunday').click();
		await expect(picker(page)).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot(`meal-picker${theme === 'day' ? '' : '-evening'}.png`);
	});
}
