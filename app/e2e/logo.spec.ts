import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const logo = readFileSync(new URL('../../site/logo.svg', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test("the page's icon is the FamilyHub logo", async ({ page, request }) => {
	await page.goto('/');
	const href = new URL((await page.locator('link[rel="icon"]').getAttribute('href'))!, page.url());
	expect(href.pathname).toBe('/logo.svg');

	const response = await request.get(href.href);
	expect(response.headers()['content-type']).toContain('image/svg+xml');
	expect((await response.text()).replace(/\r\n/g, '\n')).toBe(logo);
});
