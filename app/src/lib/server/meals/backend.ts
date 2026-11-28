// The Hub's saved meals and dinner plan, from the backend (AB#98, ADR 0017): kept fresh in the background, shown from
// disk when the backend can't be reached, and changed at once or queued until it can be, as the Shopping list is.
import type { Meal, MealChange, MealsResult, PlanDay } from '#lib/meals.ts';
import type { BackendRequest } from '../backend/auth.ts';
import { createOperationQueue } from '../backend/operations.ts';
import { orElse } from '../fallback.ts';
import { readJson, writeJson } from '../store.ts';
import { createSync, type Kept, type Sync } from '../sync.ts';
import type { MealsSource } from './fake.ts';
import {
	fromBackend,
	toOperation,
	withOperations,
	type BackendMeal,
	type BackendPlanDay,
	type MealOperation
} from './from-backend.ts';

const NAME = 'Meals';
const CACHE_FILE = 'meals-backend-cache.json';
const QUEUE_FILE = 'meals-backend-queue.json';
// Changes at the Hub refresh the meals straight away, and live updates bring changes made elsewhere. The catch-up is
// the safety net for a missed message, and every minute while the live connection is down.
const REFRESH_MS = 60_000;
const CATCH_UP_MS = 10 * 60_000;
// While a change waits to be sent, it's tried again this often, whatever the catch-up (AB#108).
const RETRY_MS = 20_000;

type Saved = { meals: Meal[]; plan: PlanDay[] };

export interface MealsFeedOptions {
	/** Calls the backend as the Hub, or null until the Hub has the backend's settings and its certificate. */
	api: () => BackendRequest | null;
	/** Shown until then, and whenever `sampleOnly`. */
	sample: MealsSource;
	/** CALENDAR_SOURCE=sample. */
	sampleOnly: boolean;
	/** Whether the live connection is open, so the meals can catch up less often. */
	live?: () => boolean;
	/** The data folder, for tests. */
	dir?: string;
	/** Milliseconds since 1970, for tests. */
	clock?: () => number;
	/** Told when changes that waited have all been sent, so the screen stops saying Saving. */
	sent?: () => void;
}

export interface MealsFeed {
	load(): Promise<MealsResult>;
	/** 200 once the backend has the change, 202 while it waits to be sent. */
	apply(change: MealChange): Promise<200 | 202>;
	/** Asks the backend for the meals now, such as when a live update says they changed. */
	refresh(): Promise<void>;
	/** Sends any changes still waiting, such as when live updates reconnect. Asks for nothing if none are. */
	sendWaiting(): Promise<void>;
}

export function createMealsFeed(options: MealsFeedOptions): MealsFeed {
	const queue = createOperationQueue<MealOperation>(
		QUEUE_FILE,
		{ path: '/meals/operations', name: NAME, describe: (op) => op.meal_id },
		options.dir
	);
	let sync: Sync<Saved> | undefined;
	let retry: ReturnType<typeof setTimeout> | null = null;

	async function send(request: BackendRequest, more?: Parameters<typeof queue.send>[1]) {
		const left = await queue.send(request, more);
		if (left.length > 0) retryLater();
		return left;
	}

	function retryLater() {
		if (retry) return;
		retry = setTimeout(() => {
			retry = null;
			void sendWaiting();
		}, RETRY_MS);
		// So it never keeps Node running after the server has closed (AB#41).
		retry.unref();
	}

	async function sendWaiting(): Promise<void> {
		const live = current();
		if (!live || (await queue.read()).length === 0) return;
		// The meals' fetch sends the queue first, so what comes back includes the changes.
		await live.sync.refresh({ fresh: true });
		if ((await queue.read()).length === 0) options.sent?.();
	}

	function mealsSync(request: BackendRequest): Sync<Saved> {
		sync ??= createSync({
			name: NAME,
			fetch: async () => {
				// Changes made while offline go first, so what comes back includes them.
				await send(request);
				const { meals, plan } = await request<{ meals: BackendMeal[]; plan: BackendPlanDay[] }>(
					'GET',
					'/meals?after=0'
				);
				return fromBackend(meals, plan);
			},
			everyMs: () => (options.live?.() ? CATCH_UP_MS : REFRESH_MS),
			load: async () => {
				const cached = await readJson<Saved & { at: string }>(CACHE_FILE, options.dir);
				return cached && { value: { meals: cached.meals, plan: cached.plan }, at: cached.at };
			},
			save: (k: Kept<Saved>) => writeJson(CACHE_FILE, { ...k.value, at: k.at }, options.dir),
			clock: options.clock
		});
		return sync;
	}

	function current() {
		const request = options.sampleOnly ? null : options.api();
		return request && { request, sync: mealsSync(request) };
	}

	return {
		load: () =>
			orElse(
				NAME,
				async (): Promise<MealsResult> => {
					const live = current();
					if (!live) return { ...(await options.sample.list()), status: { kind: 'sample', setUp: false } };
					const [{ value, at, error }, waiting] = await Promise.all([live.sync.read(), queue.read()]);
					const meals = withOperations(value?.meals ?? [], waiting);
					const plan = value?.plan ?? [];
					if (error || waiting.length > 0)
						return {
							meals,
							plan,
							status: { kind: 'stale', reason: 'offline', updatedAt: at, waiting: waiting.length }
						};
					return { meals, plan, status: { kind: 'live', updatedAt: at! } };
				},
				{ meals: [], plan: [], status: { kind: 'stale', reason: 'offline', updatedAt: null, waiting: 0 } }
			),

		async apply(change) {
			const live = current();
			if (!live) {
				await options.sample.apply(change);
				return 200;
			}
			// Behind any changes still waiting, so they reach the backend in the order they were made.
			const waiting = await send(live.request, [toOperation(change)]);
			if (waiting.length > 0) return 202;
			// So the page the screen loads next shows the change.
			await live.sync.refresh({ fresh: true });
			return 200;
		},

		async refresh() {
			await current()?.sync.refresh({ fresh: true });
		},

		sendWaiting
	};
}
