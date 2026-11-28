import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendRequest } from '../backend/auth.ts';
import { createMealsFeed } from './backend.ts';
import type { MealsSource } from './fake.ts';
import type { BackendMeal, BackendPlanDay, MealOperation } from './from-backend.ts';

// The data folder is a temporary one; this only keeps the store's import of the Hub's settings from failing.
vi.mock('$app/env/private', () => ({}));

/** The backend's meals and plan, kept in memory, applying operations as the real one does (#97). */
function fakeBackend() {
	const meals = new Map<string, BackendMeal>();
	const plan = new Map<string, BackendPlanDay>();
	const applied = new Set<string>();
	let seq = 0;
	const backend = {
		posts: [] as MealOperation[][],
		/** Thrown by every request while set, such as a failed fetch. */
		down: null as Error | null,
		meals: () => [...meals.values()].filter((m) => !m.removed),
		/** Another device adds a meal. */
		addElsewhere(name: string, ingredients: string[] = []) {
			seq++;
			const id = `elsewhere-${seq}`;
			meals.set(id, { id, name, ingredients, removed: false, seq });
			return id;
		},
		planElsewhere(date: string, mealId: string) {
			seq++;
			plan.set(date, { date, meal_id: mealId, seq });
		}
	};
	const request: BackendRequest = async <T>(method: 'GET' | 'POST', path: string, body?: unknown) => {
		if (backend.down) throw backend.down;
		if (method === 'GET') {
			expect(path).toBe('/meals?after=0');
			return { meals: backend.meals(), plan: [...plan.values()], seq } as T;
		}
		expect(path).toBe('/meals/operations');
		const { operations } = body as { operations: MealOperation[] };
		backend.posts.push(operations);
		const results = operations.map((op) => {
			if (applied.has(op.id)) return { id: op.id, seq, changed: false };
			applied.add(op.id);
			seq++;
			const found = meals.get(op.meal_id);
			if (op.type === 'add_meal')
				meals.set(op.meal_id, { id: op.meal_id, name: op.name, ingredients: op.ingredients, removed: false, seq });
			else if (found && op.type === 'edit_meal') Object.assign(found, { name: op.name, ingredients: op.ingredients });
			else if (found) found.removed = true;
			return { id: op.id, seq, changed: true };
		});
		return { results } as T;
	};
	return { backend, request };
}

const sample: MealsSource = {
	list: async () => ({ meals: [{ id: 's1', name: 'Sample curry', ingredients: [], saving: false }], plan: [] }),
	apply: async () => {}
};

let dir: string;
let time: number;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'hub-meals-'));
	time = Date.parse('2026-11-28T08:00:00Z');
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
	vi.restoreAllMocks();
	await rm(dir, { recursive: true, force: true });
});

function feedFor(request: BackendRequest | null, sampleOnly = false, sent?: () => void) {
	return createMealsFeed({ api: () => request, sample, sampleOnly, live: () => true, sent, dir, clock: () => time });
}

const names = async (feed: ReturnType<typeof feedFor>) => (await feed.load()).meals.map((m) => m.name);
const queued = async () => JSON.parse(await readFile(join(dir, 'meals-backend-queue.json'), 'utf8')) as MealOperation[];

describe('the backend’s meals', () => {
	it('adds a meal with one add_meal, its ingredients in order, and shows it', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);

		expect(await feed.apply({ action: 'add', name: 'Chicken curry', ingredients: ['chicken', 'onions', 'rice'] })).toBe(
			200
		);

		expect(backend.posts).toEqual([
			[
				{
					id: expect.any(String),
					type: 'add_meal',
					meal_id: expect.any(String),
					name: 'Chicken curry',
					ingredients: ['chicken', 'onions', 'rice']
				}
			]
		]);
		const { meals, status } = await feed.load();
		expect(meals).toEqual([
			{ id: expect.any(String), name: 'Chicken curry', ingredients: ['chicken', 'onions', 'rice'], saving: false }
		]);
		expect(status).toMatchObject({ kind: 'live' });
	});

	it('edits a meal with one edit_meal carrying the whole new list, and removes one', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		await feed.apply({ action: 'add', name: 'Curry', ingredients: ['chicken', 'rice'] });
		const [curry] = (await feed.load()).meals;

		await feed.apply({ action: 'edit', id: curry!.id, name: 'Chicken curry', ingredients: ['chicken thighs'] });
		expect(backend.posts.at(-1)).toEqual([
			{
				id: expect.any(String),
				type: 'edit_meal',
				meal_id: curry!.id,
				name: 'Chicken curry',
				ingredients: ['chicken thighs']
			}
		]);
		expect((await feed.load()).meals[0]).toMatchObject({ name: 'Chicken curry', ingredients: ['chicken thighs'] });

		await feed.apply({ action: 'remove', id: curry!.id });
		expect(backend.posts.at(-1)).toEqual([{ id: expect.any(String), type: 'remove_meal', meal_id: curry!.id }]);
		expect(await names(feed)).toEqual([]);
	});

	it('gives the plan as the backend has it', async () => {
		const { backend, request } = fakeBackend();
		const curry = backend.addElsewhere('Curry');
		backend.planElsewhere('2026-11-30', curry);
		expect((await feedFor(request).load()).plan).toEqual([{ date: '2026-11-30', mealId: curry }]);
	});

	it('shows an added or edited meal as saving while the backend can’t be reached, and sends it once it’s back', async () => {
		const { backend, request } = fakeBackend();
		const sent = vi.fn();
		const feed = feedFor(request, false, sent);
		await feed.apply({ action: 'add', name: 'Curry', ingredients: ['rice'] });
		const [curry] = (await feed.load()).meals;

		backend.down = new TypeError('fetch failed');
		expect(await feed.apply({ action: 'add', name: 'Fajitas', ingredients: ['wraps', 'peppers'] })).toBe(202);
		expect(await feed.apply({ action: 'edit', id: curry!.id, name: 'Curry night', ingredients: ['rice'] })).toBe(202);

		expect((await queued()).map((op) => op.type)).toEqual(['add_meal', 'edit_meal']);
		const offline = await feed.load();
		expect(offline.meals.map((m) => [m.name, m.saving])).toEqual([
			['Curry night', true],
			['Fajitas', true]
		]);
		expect(offline.status).toMatchObject({ kind: 'stale', reason: 'offline', waiting: 2 });

		backend.down = null;
		await feed.sendWaiting();
		expect(backend.meals().map((m) => m.name)).toEqual(['Curry night', 'Fajitas']);
		expect(await queued()).toEqual([]);
		expect((await feed.load()).meals.every((m) => !m.saving)).toBe(true);
		expect(sent).toHaveBeenCalledOnce();
	});

	it('loses nothing if the Hub restarts while a change waits', async () => {
		const { backend, request } = fakeBackend();
		await feedFor(request).apply({ action: 'add', name: 'Curry', ingredients: [] });
		backend.down = new TypeError('fetch failed');
		expect(await feedFor(request).apply({ action: 'add', name: 'Fajitas', ingredients: ['wraps'] })).toBe(202);

		// A new feed, as after a restart, reading the same data folder.
		const restarted = feedFor(request);
		expect(await names(restarted)).toEqual(['Curry', 'Fajitas']);
		expect((await restarted.load()).meals.find((m) => m.name === 'Fajitas')!.saving).toBe(true);

		backend.down = null;
		await restarted.sendWaiting();
		expect(backend.meals().map((m) => m.name)).toEqual(['Curry', 'Fajitas']);
	});

	it('shows the last meals from disk while the backend can’t be reached', async () => {
		const { backend, request } = fakeBackend();
		backend.addElsewhere('Curry');
		await feedFor(request).load();
		backend.down = new TypeError('fetch failed');

		// Shown from disk at once, then marked offline once the fetch behind it fails.
		const restarted = feedFor(request);
		expect(await names(restarted)).toEqual(['Curry']);
		await vi.waitFor(async () =>
			expect((await restarted.load()).status).toMatchObject({ kind: 'stale', reason: 'offline' })
		);
		expect(await names(restarted)).toEqual(['Curry']);
	});

	it('shows a meal another device added once told the meals changed, without waiting for the catch-up', async () => {
		const { backend, request } = fakeBackend();
		const feed = feedFor(request);
		await feed.load();

		backend.addElsewhere('Fish pie', ['fish pie mix', 'potatoes']);
		expect(await names(feed)).toEqual([]);
		await feed.refresh();
		expect(await names(feed)).toEqual(['Fish pie']);
	});

	it('shows and changes the sample meals until the Hub has the backend’s settings, or with CALENDAR_SOURCE=sample', async () => {
		const changes: unknown[] = [];
		const { backend, request } = fakeBackend();
		for (const feed of [
			createMealsFeed({
				api: () => null,
				sample: { ...sample, apply: async (c) => void changes.push(c) },
				sampleOnly: false,
				dir
			}),
			createMealsFeed({
				api: () => request,
				sample: { ...sample, apply: async (c) => void changes.push(c) },
				sampleOnly: true,
				dir
			})
		]) {
			const { meals, status } = await feed.load();
			expect(meals.map((m) => m.name)).toEqual(['Sample curry']);
			expect(status).toEqual({ kind: 'sample', setUp: false });
			expect(await feed.apply({ action: 'add', name: 'Pie', ingredients: [] })).toBe(200);
		}
		expect(changes).toHaveLength(2);
		expect(backend.posts).toEqual([]);
	});
});
