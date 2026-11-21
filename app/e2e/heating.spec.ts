import { expect, test } from '@playwright/test';
import { NO_NEST_URL, NOW } from '../playwright.config.ts';

// The Nest's heating in the header (ADR 0013). What each of its states says is tested in src/lib/server/nest, and how
// it looks in the Today view's screenshots.

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date(NOW));
});

test('with sample data, the header shows the heating beside the weather', async ({ page }) => {
	await page.goto('/');
	const header = page.locator('header');
	await expect(header).toContainText('19.5°');
	await expect(header).toContainText('Heating to 21°');
	await expect(header).toContainText('Inside · Humidity 67%');
	await expect(header).toContainText('Light rain');
});

test.describe('with no Nest connected', () => {
	test.use({ baseURL: NO_NEST_URL });

	test('the header shows nothing for heating, and the weather as before', async ({ page }) => {
		await page.goto('/');
		const header = page.locator('header');
		await expect(header).toContainText('11°');
		await expect(header).toContainText('Light rain');
		await expect(header).toContainText('High 13° · Low 8°');
		await expect(header).not.toContainText('Inside');
		await expect(header).not.toContainText('Heating');
		await expect(header.locator('.heating')).toHaveCount(0);
	});

	test('Settings offers to connect the Nest', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByRole('link', { name: 'Connect the Nest' })).toHaveAttribute('href', '/auth/nest');
	});

	test('connecting goes through Nest’s Partner Connections page, with the Hub’s client and the SDM scope', async ({
		request
	}) => {
		const response = await request.get('/auth/nest', { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		const to = new URL(response.headers()['location']!);
		expect(to.origin + to.pathname).toBe('https://nestservices.google.com/partnerconnections/e2e-project/auth');
		expect(to.searchParams.get('client_id')).toBe('e2e-client.apps.googleusercontent.com');
		expect(to.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/sdm.service');
		expect(to.searchParams.get('redirect_uri')).toBe(`${NO_NEST_URL}/auth/nest/callback`);
		expect(to.searchParams.get('access_type')).toBe('offline');
		expect(to.searchParams.get('state')).toBeTruthy();
	});

	test('a callback that doesn’t match the sign-in started is turned down', async ({ page }) => {
		await page.goto('/auth/nest/callback?code=made-up&state=not-ours');
		await expect(page).toHaveURL('/settings?problem=nest-expired');
		await expect(page.getByText('Connecting the Nest took too long. Try again.')).toBeVisible();
	});
});
