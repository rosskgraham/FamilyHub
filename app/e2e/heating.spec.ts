import { expect, test } from '@playwright/test';
import { HEATING_URL, NO_NEST_URL, NOW } from '../playwright.config.ts';

// The Nest's heating in the header, and the Heating panel it opens to change the target (ADR 0013). What each state
// says is tested in src/lib/server/nest and src/lib/heating.test.ts, and how the header looks in the Today view's
// screenshots.

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

test.describe('the Heating panel', () => {
	const openPanel = async (page: import('@playwright/test').Page) => {
		await page.getByRole('button', { name: 'Heating, change the target' }).click();
		const panel = page.getByRole('dialog', { name: 'Heating' });
		await expect(panel).toBeVisible();
		return panel;
	};

	test('opens from the heating in the header, with the target and − and +, as in mockup C', async ({ page }) => {
		await page.goto('/');
		const panel = await openPanel(page);
		await expect(panel).toContainText('19.5°');
		await expect(panel).toContainText('Inside now');
		await expect(panel).toContainText('Heating');
		await expect(panel).toContainText('Until the next scheduled change');
		await expect(panel).toContainText('21°');
		await expect(panel.getByRole('button', { name: 'Lower the target' })).toBeEnabled();
		await expect(panel.getByRole('button', { name: 'Raise the target' })).toBeEnabled();
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot('heating-panel.png');
	});

	test('in the Evening theme', async ({ page }) => {
		await page.goto('/?theme=evening');
		await openPanel(page);
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot('heating-panel-evening.png');
	});

	for (const [state, why] of [
		['eco', 'The Nest is in Eco, so the target can’t be changed here.'],
		['off', 'The heating is off, so the target can’t be changed here.'],
		['not-reporting', 'The Nest isn’t reporting, so the target can’t be changed here.']
	] as const) {
		test(`in ${state}, says why and has no − or +`, async ({ page }) => {
			await page.goto(`/?heating=${state}`);
			const panel = await openPanel(page);
			await expect(panel).toContainText(why);
			await expect(panel.getByRole('button', { name: 'Lower the target' })).toHaveCount(0);
			await expect(panel.getByRole('button', { name: 'Raise the target' })).toHaveCount(0);
		});
	}

	test('closes with Close', async ({ page }) => {
		await page.goto('/');
		const panel = await openPanel(page);
		await panel.getByRole('button', { name: 'Close' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	test('closes when tapped outside it', async ({ page }) => {
		await page.goto('/');
		await openPanel(page);
		await page.mouse.click(40, 540);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	test('closes after two minutes untouched', async ({ page }) => {
		await page.clock.install({ time: new Date(NOW) });
		await page.goto('/');
		await openPanel(page);
		await page.clock.fastForward('01:50');
		await expect(page.getByRole('dialog', { name: 'Heating' })).toBeVisible();
		await page.clock.fastForward('00:15');
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});
});

// On a Hub of their own, as they change its sample heating, and in order, each putting it back.
test.describe.serial('changing the target', () => {
	test.use({ baseURL: HEATING_URL });

	test('a run of taps sends one change, the header shows it, and + stops at 22°, as in mockup D', async ({ page }) => {
		const sent: unknown[] = [];
		const google: string[] = [];
		page.on('request', (r) => {
			if (r.url().endsWith('/api/heating') && r.method() === 'POST') sent.push(r.postDataJSON());
			if (/googleapis\.com/.test(r.url())) google.push(r.url());
		});
		await page.goto('/');
		await page.getByRole('button', { name: 'Heating, change the target' }).click();
		const panel = page.getByRole('dialog', { name: 'Heating' });
		const raise = panel.getByRole('button', { name: 'Raise the target' });
		await raise.click();
		await raise.click();
		await expect(panel).toContainText('22°');
		await expect(raise).toBeDisabled();

		// Sent once the taps have stopped for 2 seconds, and read back from the sample.
		await expect(page.locator('header')).toContainText('Heating to 22°', { timeout: 5000 });
		expect(sent).toEqual([{ target: 22 }]);
		await expect(raise).toBeDisabled();
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot('heating-panel-22.png');

		// Put back, closing the panel before the 2 seconds are up: the change still goes, straight away.
		const lower = panel.getByRole('button', { name: 'Lower the target' });
		await lower.click();
		await lower.click();
		await panel.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('header')).toContainText('Heating to 21°', { timeout: 1500 });
		expect(sent).toEqual([{ target: 22 }, { target: 21 }]);
		expect(google).toEqual([]);
	});

	test('with sample data, a change reaches only the sample: this Hub has no Google client to reach the Nest with', async ({
		request
	}) => {
		// Changed, which only the sample can be here: a real Nest would need the Google client this Hub hasn't got.
		const changed = await request.post('/api/heating', { data: { target: 20 } });
		expect(changed.status()).toBe(200);
		expect(await changed.json()).toMatchObject({ outcome: 'changed', heating: { target: 20, heating: true } });
		const back = await request.post('/api/heating', { data: { target: 21 } });
		expect(await back.json()).toMatchObject({ outcome: 'changed', heating: { target: 21 } });
	});

	test('a target outside 16° to 22°, or off a step, is turned down', async ({ request }) => {
		for (const target of [15.5, 22.5, 21.2, '21']) {
			const response = await request.post('/api/heating', { data: { target } });
			expect(response.status()).toBe(400);
		}
	});
});
