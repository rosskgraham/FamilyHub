import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendRequestFailed, BackendSignInRefused, type BackendRequest } from '../backend/auth.ts';
import { createBackendFeed } from './backend.ts';
import type { BackendItem, Operation } from './from-backend.ts';
import type { ShoppingSource } from './source.ts';

// The data folder is a temporary one; this only keeps the store's import of the Hub's settings from failing.
vi.mock('$app/env/private', () => ({}));

/**
 * The backend's Shopping list, kept in memory, applying operations as the real one does: in order, each once however
 * often it's sent, and a whole batch turned down (422) if any of it is.
 */
function fakeBackend() {
	const items = new Map<string, BackendItem>();
	const applied = new Set<string>();
	let seq = 0;
	const posts: Operation[][] = [];
	const backend = {
		items: () => [...items.values()].filter((i) => !i.removed),
		posts,
		/** Thrown by every request while set, such as a failed fetch or a refused sign-in. */
		down: null as Error | null,
		/** Items a change to is turned down. */
		refuse: new Set<string>(),
		/** Applies the next batch, then loses its answer. */
		loseNextAnswer: false,
		/** How often the list was asked for. */
		gets: 0
	};
	const request: BackendRequest = async <T>(method: 'GET' | 'POST', path: string, body?: unknown) => {
		if (backend.down) throw backend.down;
		if (method === 'GET') {
			backend.gets += 1;
			expect(path).toBe('/lists/shopping/items?after=0');
			return { items: backend.items(), shops: [], seq } as T;
		}
		expect(path).toBe('/lists/shopping/operations');
		const { operations } = body as { operations: Operation[] };
		posts.push(operations);
		if (operations.some((op) => backend.refuse.has(op.item_id)))
			throw new BackendRequestFailed('Backend request failed, POST /lists/shopping/operations: 422', 422);
		const results = operations.map((op) => {
			if (applied.has(op.id)) return { id: op.id, seq, changed: false };
			applied.add(op.id);
			seq++;
			const found = items.get(op.item_id);
			if (op.type === 'add')
				items.set(op.item_id, {
					id: op.item_id,
					text: op.text,
					ticked_off: false,
					ticked_off_at: null,
					removed: false,
					seq,
					added_seq: seq
				});
			else if (found && op.type === 'remove') found.removed = true;
			else if (found) found.ticked_off = op.type === 'tick';
			return { id: op.id, seq, changed: true };
		});
		if (backend.loseNextAnswer) {
			backend.loseNextAnswer = false;
			throw new TypeError('fetch failed');
		}
		return { results } as T;
	};
	return { backend, request };
}

const sample: ShoppingSource = {
	list: async () => [{ id: 'sample-1', text: 'Sample milk', tickedOff: false }],
	add: async () => 'sample-2',
	setTickedOff: async () => {},
	remove: async () => {}
};

let dir: string;
let time: number;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'hub-shopping-'));
	time = Date.parse('2026-11-26T08:00:00Z');
	errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
	vi.restoreAllMocks();
	await rm(dir, { recursive: true, force: true });
});

function feedFor(request: BackendRequest | null, sampleOnly = false, live?: () => boolean) {
	return createBackendFeed({ api: () => request, sample, sampleOnly, live, dir, clock: () => time });
}

const texts = (items: { text: string; tickedOff: boolean }[]) =>
	items.map((i) => (i.tickedOff ? `✓ ${i.text}` : i.text));
const queued = async () => JSON.parse(await readFile(join(dir, 'shopping-backend-queue.json'), 'utf8')) as Operation[];

describe('the backend Shopping list', () => {
	it('shows the backend’s list, newest first, as live', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		await feed.apply({ action: 'add', text: 'Milk' });
		await feed.apply({ action: 'add', text: 'Eggs' });
		const { items, status } = await feed.load();
		expect(texts(items)).toEqual(['Eggs', 'Milk']);
		expect(status).toMatchObject({ kind: 'live' });
		expect(backend.items()).toHaveLength(2);
	});

	it('sends one operation for each add, tick, untick and remove, with ids made on the Hub', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		expect(await feed.apply({ action: 'add', text: 'Milk' })).toBe(200);
		const [{ id }] = (await feed.load()).items;
		await feed.apply({ action: 'tick', id, tickedOff: true });
		expect(texts((await feed.load()).items)).toEqual(['✓ Milk']);
		await feed.apply({ action: 'tick', id, tickedOff: false });
		await feed.apply({ action: 'remove', id });
		expect((await feed.load()).items).toEqual([]);

		expect(backend.posts.map((batch) => batch.map((op) => op.type))).toEqual([
			['add'],
			['tick'],
			['untick'],
			['remove']
		]);
		const add = backend.posts[0]![0] as Extract<Operation, { type: 'add' }>;
		expect(add).toEqual({ id: expect.any(String), type: 'add', item_id: id, text: 'Milk' });
		expect(new Set(backend.posts.map(([op]) => op!.id)).size).toBe(4);
		expect(backend.posts.slice(1).every(([op]) => op!.item_id === id)).toBe(true);
	});

	it('queues changes in a file while the backend can’t be reached, shows them, and sends them in order once it’s back', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		await feed.apply({ action: 'add', text: 'Eggs' });
		const [eggs] = (await feed.load()).items;

		backend.down = new TypeError('fetch failed');
		expect(await feed.apply({ action: 'add', text: 'Milk' })).toBe(202);
		expect(await feed.apply({ action: 'tick', id: eggs!.id, tickedOff: true })).toBe(202);
		expect((await queued()).map((op) => op.type)).toEqual(['add', 'tick']);
		const offline = await feed.load();
		expect(texts(offline.items)).toEqual(['Milk', '✓ Eggs']);
		expect(offline.status).toMatchObject({ kind: 'stale', reason: 'offline', waiting: 2 });

		backend.down = null;
		time += 60_000;
		// The sync, in the background, sends the queue before asking for the list.
		await vi.waitFor(async () => expect((await feed.load()).status).toMatchObject({ kind: 'live' }));
		expect(await queued()).toEqual([]);
		expect(texts((await feed.load()).items)).toEqual(['Milk', '✓ Eggs']);
		expect(backend.posts.at(-1)!.map((op) => op.type)).toEqual(['add', 'tick']);
	});

	it('sends the same ids again after a lost answer, so the backend changes nothing twice', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		backend.loseNextAnswer = true;
		expect(await feed.apply({ action: 'add', text: 'Milk' })).toBe(202);
		const [lost] = await queued();

		expect(await feed.apply({ action: 'add', text: 'Eggs' })).toBe(200);
		expect(backend.posts[1]![0]).toEqual(lost);
		expect(backend.items().map((i) => i.text)).toEqual(['Milk', 'Eggs']);
		expect(texts((await feed.load()).items)).toEqual(['Eggs', 'Milk']);
	});

	it('logs and drops a change the backend turns down, and still sends the changes after it', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		await feed.apply({ action: 'add', text: 'Eggs' });
		const [eggs] = (await feed.load()).items;

		backend.down = new TypeError('fetch failed');
		await feed.apply({ action: 'add', text: 'Milk' });
		await feed.apply({ action: 'tick', id: eggs!.id, tickedOff: true });
		await feed.apply({ action: 'add', text: 'Bread' });
		backend.down = null;
		backend.refuse.add(eggs!.id);

		expect(await feed.apply({ action: 'add', text: 'Jam' })).toBe(200);
		expect(await queued()).toEqual([]);
		expect(backend.items().map((i) => [i.text, i.ticked_off])).toEqual([
			['Eggs', false],
			['Milk', false],
			['Bread', false],
			['Jam', false]
		]);
		expect(errors).toHaveBeenCalledWith(
			expect.stringContaining('Shopping list change dropped: tick'),
			expect.any(String)
		);
	});

	it.each([401, 403])(
		'says Offline, not Sign in needed, when the backend refuses the Hub (%i), and logs it',
		async (status) => {
			const { backend, request } = fakeBackend();
			backend.down = new BackendSignInRefused(`Backend refused the Hub: GET /lists/shopping/items?after=0: ${status}`);
			const { status: shown } = await feedFor(request).load();
			expect(shown).toMatchObject({ kind: 'stale', reason: 'offline' });
			expect(errors).toHaveBeenCalledWith('Shopping list sync failed:', expect.stringContaining(`${status}`));
		}
	);

	it('shows the sample list with CALENDAR_SOURCE=sample, or until the Hub has the backend’s settings', async () => {
		const { backend, request } = fakeBackend();
		for (const feed of [feedFor(request, true), feedFor(null)]) {
			const { items, status } = await feed.load();
			expect(texts(items)).toEqual(['Sample milk']);
			expect(status).toEqual({ kind: 'sample', setUp: false });
			expect(await feed.apply({ action: 'add', text: 'Milk' })).toBe(200);
		}
		expect(backend.posts).toEqual([]);
	});
});

describe('catching up', () => {
	/** Lets a fetch the read started in the background finish. */
	const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

	it('asks every 10 minutes while the live connection is open, and every minute while it isn’t', async () => {
		let connected = true;
		const { backend, request } = fakeBackend();
		const feed = feedFor(request, false, () => connected);
		await feed.load();
		expect(backend.gets).toBe(1);

		time += 9 * 60_000;
		await feed.load();
		await settle();
		expect(backend.gets).toBe(1);
		time += 60_000;
		await feed.load();
		await settle();
		expect(backend.gets).toBe(2);

		connected = false;
		time += 60_000;
		await feed.load();
		await settle();
		expect(backend.gets).toBe(3);
	});

	it('asks every minute without live updates', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		await feed.load();
		time += 60_000;
		await feed.load();
		await settle();
		expect(backend.gets).toBe(2);
	});

	it('asks at once when told the list changed, such as by a live update', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request, false, () => true);
		await feed.load();
		await feed.refresh();
		expect(backend.gets).toBe(2);
	});
});
