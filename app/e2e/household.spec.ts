import { expect, test, type Page } from '@playwright/test';
import { NOW } from '../playwright.config.ts';

// About this Hub changes with every build. Hidden with a stylesheet rather than masked, as a mask is drawn over
// whatever's in front, such as the bottom bar, when Settings is scrolled.
const hideBuildDetails = (page: Page) => page.addStyleTag({ content: '.varies { visibility: hidden; }' });

test.beforeEach(async ({ page }) => {
	// The browser's clock, to match the server's HUB_NOW. Without it, from 22:00 the Hub is asleep.
	await page.clock.setFixedTime(new Date(NOW));
});

// Every spec shares one data folder, and a Member added here would replace the sample Household in every other
// test's screenshots. So these never save a change: adding, renaming and removing are tested against the database in
// src/lib/server/household.test.ts.

async function unlock(page: Page) {
	const hold = page.getByRole('button', { name: 'Hold to change the Household and Google' });
	// Below the Sleep hours, it starts out of view, so it's scrolled to first, as a finger would.
	await hold.scrollIntoViewIfNeeded();
	const box = (await hold.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
	await page.mouse.up();
}

test('the Household is locked until held, so nobody changes it by accident', async ({ page }) => {
	await page.goto('/settings');
	const name = page.getByRole('textbox', { name: 'New Member’s name' });
	// Tapped where it is, as a finger would: locked, it can't take focus.
	const tap = async () => {
		// Scrolled to first, as a finger would: below the Clock and Theme rows, it starts out of view.
		await name.scrollIntoViewIfNeeded();
		const box = (await name.boundingBox())!;
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	};
	await tap();
	await expect(name).not.toBeFocused();
	await unlock(page);
	await tap();
	await expect(name).toBeFocused();

	await page.getByRole('button', { name: 'Done' }).click();
	await tap();
	await expect(name).not.toBeFocused();
});

test('adding a Member without a name says what’s missing', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByText('The Hub is showing a made-up Household.')).toBeVisible();
	await unlock(page);
	await page.locator('form.member').last().getByRole('button', { name: 'Add' }).click();
	await expect(page.getByRole('alert')).toHaveText('Type a name.');
});

test('the old setup address opens Settings, with any sign-in problem', async ({ page }) => {
	await page.goto('/setup?problem=cancelled');
	await expect(page).toHaveURL('/settings?problem=cancelled');
	await expect(page.getByText('Signing in was cancelled.')).toBeVisible();
});

test('the status in the corner opens Settings to set up Google', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Sample data · set up Google' }).click();
	await expect(page).toHaveURL('/settings');
});

// Settings is taller than the screen. It's made taller still with a stylesheet, not added elements, as Svelte can
// render the page again while it hydrates, which took away added elements when the machine was busy.
test('Settings scrolls when it is taller than the screen', async ({ page }) => {
	await page.goto('/settings');
	await page.addStyleTag({ content: 'section.settings::after { content: ""; display: block; height: 2000px; }' });
	const settings = page.locator('section.settings');
	const box = (await settings.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 5000);
	await expect
		.poll(() => settings.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
		.toBeLessThanOrEqual(1);
	expect(await settings.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('household settings, unlocked', async ({ page }) => {
	await page.goto('/settings');
	await unlock(page);
	await page.locator('.household').scrollIntoViewIfNeeded();
	await hideBuildDetails(page);
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('settings-household.png');
});
