import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let dir: string | undefined;
afterEach(async () => {
	vi.resetModules();
	vi.doUnmock('$app/env/private');
	if (dir) await rm(dir, { recursive: true, force: true });
});

/** The Shopping list module with these settings, and a temporary data folder, never app/data. */
async function shoppingWith(env: { SHOPPING_SOURCE?: string; CALENDAR_SOURCE?: string }) {
	dir = await mkdtemp(join(tmpdir(), 'hub-shopping-'));
	vi.doMock('$app/env/private', () => ({
		HUB_NOW: undefined,
		HUB_DATA_DIR: dir,
		SHOPPING_SOURCE: undefined,
		CALENDAR_SOURCE: undefined,
		...env
	}));
	return import('./index.ts');
}

// The Google Tasks list itself is unchanged; the e2e tests show its sample list, as they run with CALENDAR_SOURCE=sample.
describe('shopping', () => {
	it.each([undefined, 'google'])('is Google Tasks when SHOPPING_SOURCE is %s', async (source) => {
		const { shopping, googleFeed } = await shoppingWith({ SHOPPING_SOURCE: source });
		expect(shopping).toBe(googleFeed);
	});

	it('is the backend’s with SHOPPING_SOURCE=backend', async () => {
		const { shopping, backendFeed } = await shoppingWith({ SHOPPING_SOURCE: 'backend' });
		expect(shopping).toBe(backendFeed);
	});

	it('is the sample list with SHOPPING_SOURCE=backend and CALENDAR_SOURCE=sample', async () => {
		const { loadShopping } = await shoppingWith({ SHOPPING_SOURCE: 'backend', CALENDAR_SOURCE: 'sample' });
		const { items, status } = await loadShopping();
		expect(status).toEqual({ kind: 'sample', setUp: false });
		expect(items.map((i) => i.text)).toContain('Milk');
	});
});
