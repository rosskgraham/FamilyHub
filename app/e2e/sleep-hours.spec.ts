import { expect, test, type Page } from '@playwright/test';
import { HEATING_URL, NOW } from '../playwright.config.ts';

// The Sleep and Lights out hours in Settings (AB#64). On the Hub the heating tests change, in order, each putting the
// hours back, so the other tests and their screenshots always see the defaults.
test.describe.configure({ mode: 'serial' });
test.use({ baseURL: HEATING_URL });

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

const time = (page: Page, name: string) => page.getByRole('group', { name }).locator('output');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('Settings shows the default hours, with Lights out on', async ({ page }) => {
	await page.goto('/settings');
	await expect(time(page, 'Sleep from')).toHaveText('22:00');
	await expect(time(page, 'Sleep until')).toHaveText('06:30');
	await expect(time(page, 'Lights out from')).toHaveText('00:00');
	await expect(time(page, 'Lights out until')).toHaveText('06:00');
	const lightsOut = page.getByRole('group', { name: 'Lights out', exact: true });
	await expect(lightsOut.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
});

test('− and + move a time by half an hour, and it stays saved', async ({ page }) => {
	await page.goto('/settings');
	await button(page, 'Sleep from earlier').click();
	await expect(time(page, 'Sleep from')).toHaveText('21:30');
	await page.reload();
	await expect(time(page, 'Sleep from')).toHaveText('21:30');

	await button(page, 'Sleep from later').click();
	await expect(time(page, 'Sleep from')).toHaveText('22:00');
});

test('Lights out stops at the end of Sleep, and says why', async ({ page }) => {
	await page.goto('/settings');
	await button(page, 'Lights out until later').click();
	await expect(time(page, 'Lights out until')).toHaveText('06:30');
	await expect(button(page, 'Lights out until later')).toBeDisabled();
	await expect(page.getByText('Lights out ends by the end of Sleep, 06:30.')).toBeVisible();
	await page.getByRole('region', { name: 'Sleep' }).scrollIntoViewIfNeeded();
	await page.evaluate(() => document.fonts.ready);
	// As in the Lights out mockup C.
	await expect(page.getByRole('region', { name: 'Sleep' })).toHaveScreenshot('settings-lights-out-limit.png');

	await button(page, 'Lights out until earlier').click();
	await expect(time(page, 'Lights out until')).toHaveText('06:00');
	await expect(page.getByText('Lights out ends by the end of Sleep')).toBeHidden();
});

test('moving Sleep in past Lights out moves Lights out with it', async ({ page }) => {
	await page.goto('/settings');
	await button(page, 'Sleep until earlier').click();
	await button(page, 'Sleep until earlier').click();
	await expect(time(page, 'Sleep until')).toHaveText('05:30');
	await expect(time(page, 'Lights out until')).toHaveText('05:30');

	await button(page, 'Sleep until later').click();
	await button(page, 'Sleep until later').click();
	await button(page, 'Lights out until later').click();
	await expect(time(page, 'Sleep until')).toHaveText('06:30');
	await expect(time(page, 'Lights out until')).toHaveText('06:00');
});

test('turning Lights out off keeps its times, and they can’t be changed until it’s on again', async ({ page }) => {
	await page.goto('/settings');
	const lightsOut = page.getByRole('group', { name: 'Lights out', exact: true });
	await lightsOut.getByRole('button', { name: 'Off' }).click();
	await expect(lightsOut.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
	await expect(time(page, 'Lights out from')).toHaveText('00:00');
	for (const name of [
		'Lights out from earlier',
		'Lights out from later',
		'Lights out until earlier',
		'Lights out until later'
	])
		await expect(button(page, name)).toBeDisabled();

	await lightsOut.getByRole('button', { name: 'On' }).click();
	await expect(lightsOut.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
	await expect(button(page, 'Lights out from earlier')).toBeEnabled();
});

test('the screen service hears it isn’t Lights out at 08:15', async ({ request }) => {
	const response = await request.get('/api/screen');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ lightsOut: false, touches: expect.any(Number) });
});

test('the Hub wakes when the screen service says a touch lit the dark screen', async ({ page, request }) => {
	// 23:00, in Sleep hours. Chromium never sees a touch made while the screen is dark.
	await page.clock.install({ time: new Date('2026-10-28T23:00:00Z') });
	await page.goto('/');
	const sleep = page.getByRole('button', { name: 'Wake the Hub' });
	await expect(sleep).toBeVisible();
	// The page has asked at least once, so it knows how many touches there have been.
	await page.clock.runFor(1_000);

	// As the screen service sends it: SvelteKit refuses a bare POST from anywhere but its own pages.
	expect((await request.post('/api/screen', { data: {} })).status()).toBe(204);
	await page.clock.runFor(1_000);
	await expect(sleep).toBeHidden();
});
