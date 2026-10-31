import { expect, test } from '@playwright/test';

test('the health check answers with the version', async ({ request }) => {
	const response = await request.get('/api/health');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ status: 'ok', version: expect.any(String) });
});
