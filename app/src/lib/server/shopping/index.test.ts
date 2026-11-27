import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let dir: string | undefined;
afterEach(async () => {
	vi.resetModules();
	vi.doUnmock('$app/env/private');
	vi.doUnmock('../backend/index.ts');
	if (dir) await rm(dir, { recursive: true, force: true });
});

/** The Shopping list module with these settings, and a temporary data folder, never app/data. */
async function shoppingWith(env: { CALENDAR_SOURCE?: string }) {
	dir = await mkdtemp(join(tmpdir(), 'hub-shopping-'));
	vi.doMock('$app/env/private', () => ({
		HUB_NOW: undefined,
		HUB_DATA_DIR: dir,
		CALENDAR_SOURCE: undefined,
		...env
	}));
	return import('./index.ts');
}

/** As shoppingWith, with the backend's settings: a fake backend that counts how often the list is asked for. */
async function withBackend(env: { CALENDAR_SOURCE?: string } = {}) {
	const asked = { count: 0 };
	const eggs = { id: 'a', text: 'Eggs', ticked_off: false, ticked_off_at: null, removed: false, seq: 1, added_seq: 1 };
	const request = async () => (asked.count++, { items: [eggs], shops: [], seq: 1 });
	vi.doMock('../backend/index.ts', () => ({ backend: () => ({ request }) }));
	const shopping = await shoppingWith(env);
	const { onListChanged } = await import('../changes.ts');
	const told: string[] = [];
	onListChanged((list) => told.push(list));
	return { ...shopping, asked, told };
}

// The e2e tests show the sample list, as they run with CALENDAR_SOURCE=sample.
describe('shopping', () => {
	it('is the backend’s list once the Hub has the backend’s settings', async () => {
		const { loadShopping, asked } = await withBackend();
		const { items } = await loadShopping();
		expect(asked.count).toBeGreaterThan(0);
		expect(items.map((i) => i.text)).toEqual(['Eggs']);
	});

	it('is the sample list without the backend’s settings', async () => {
		vi.doMock('../backend/index.ts', () => ({ backend: () => null }));
		const { loadShopping, shoppingIsLive } = await shoppingWith({});
		const { items, status } = await loadShopping();
		expect(status.kind).toBe('sample');
		expect(items.map((i) => i.text)).toContain('Milk');
		expect(shoppingIsLive()).toBe(false);
	});

	it('is the sample list with CALENDAR_SOURCE=sample, even with the backend’s settings', async () => {
		const { loadShopping, asked } = await withBackend({ CALENDAR_SOURCE: 'sample' });
		const { items, status } = await loadShopping();
		expect(status).toEqual({ kind: 'sample', setUp: false });
		expect(items.map((i) => i.text)).toContain('Milk');
		expect(asked.count).toBe(0);
	});
});

describe('onLiveMessage', () => {
	it('fetches the backend Shopping list and tells the screen', async () => {
		const { onLiveMessage, shoppingIsLive, asked, told } = await withBackend();
		expect(shoppingIsLive()).toBe(true);
		await onLiveMessage('shopping');
		expect(asked.count).toBe(1);
		expect(told).toEqual(['shopping']);
	});

	it('ignores other lists’ messages', async () => {
		const { onLiveMessage, asked, told } = await withBackend();
		await onLiveMessage('todos');
		expect([asked.count, told]).toEqual([0, []]);
	});

	it('ignores everything while the Hub shows the sample list', async () => {
		const { onLiveMessage, shoppingIsLive, asked, told } = await withBackend({ CALENDAR_SOURCE: 'sample' });
		expect(shoppingIsLive()).toBe(false);
		await onLiveMessage('shopping');
		expect([asked.count, told]).toEqual([0, []]);
	});
});
