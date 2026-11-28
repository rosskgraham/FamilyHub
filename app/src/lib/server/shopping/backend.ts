// The Hub's Shopping list, from the family app's backend since the switch from Google Tasks (AB#103): kept fresh in the
// background, shown from disk when the backend can't be reached, and changed at once or queued until it can be.
import { matchName, MOST_REGULARS, type Regulars, type ShoppingItem } from '#lib/shopping.ts';
import { randomUUID } from 'node:crypto';
import { BackendRequestFailed, type BackendRequest } from '../backend/auth.ts';
import { orElse } from '../fallback.ts';
import { readJson, writeJson } from '../store.ts';
import { createSync, type Kept, type Sync } from '../sync.ts';
import type { Feed } from '../tasks/feed.ts';
import { toOperation, toShoppingItems, withOperations, type BackendItem, type Operation } from './from-backend.ts';
import type { ShoppingSource } from './source.ts';

const NAME = 'Shopping list';
// Files in the Hub's data folder, apart from the Google Tasks list's, so switching back and forth never mixes them.
const CACHE_FILE = 'shopping-backend-cache.json';
const QUEUE_FILE = 'shopping-backend-queue.json';
// The last regulars the backend gave, so the panel still has them offline (AB#110).
const REGULARS_FILE = 'shopping-backend-regulars.json';
// Changes at the Hub refresh the list straight away, and live updates bring changes made on phones. The catch-up is
// the safety net for a missed message, and every minute while the live connection is down.
const REFRESH_MS = 60_000;
const CATCH_UP_MS = 10 * 60_000;
// While a change waits to be sent, it's tried again this often, whatever the catch-up (AB#108).
const RETRY_MS = 20_000;
// The most the backend takes in one request.
const BATCH = 100;

/** The backend won't take a change, such as ticking off an item with no text. None of its batch was applied. */
const turnedDown = (e: unknown) => e instanceof BackendRequestFailed && e.status === 422;
const why = (e: unknown) => (e instanceof Error ? e.message : e);

async function post(request: BackendRequest, operations: Operation[]): Promise<void> {
	await request('POST', '/lists/shopping/operations', { operations });
}

/**
 * Sends the operations in order, in batches, and resolves to what's left: nothing, or everything from the first one the
 * backend couldn't be reached for. One it turns down is logged and dropped rather than retried forever. Operations
 * already applied before a lost answer are sent again with the same ids, which changes nothing.
 */
export async function sendOperations(
	operations: Operation[],
	request: BackendRequest,
	name = NAME
): Promise<Operation[]> {
	for (let i = 0; i < operations.length; i += BATCH) {
		const batch = operations.slice(i, i + BATCH);
		try {
			await post(request, batch);
			continue;
		} catch (e) {
			if (!turnedDown(e)) {
				console.error(`${name} still offline:`, why(e));
				return operations.slice(i);
			}
		}
		// One of the batch was turned down, so none of it was applied: send them one at a time, to drop only that one.
		for (const [j, op] of batch.entries()) {
			try {
				await post(request, [op]);
			} catch (e) {
				if (turnedDown(e)) {
					console.error(`${name} change dropped: ${op.type} ${'item_id' in op ? op.item_id : op.name}:`, why(e));
					continue;
				}
				console.error(`${name} still offline:`, why(e));
				return operations.slice(i + j);
			}
		}
	}
	return [];
}

export interface OperationQueue {
	read(): Promise<Operation[]>;
	/** Sends what's waiting, then `more`, and resolves to what's still waiting. */
	send(request: BackendRequest, more?: Operation[]): Promise<Operation[]>;
}

/** Operations waiting to be sent, in a file in the Hub's data folder, or in `dir` for tests. */
export function createOperationQueue(file: string, name: string, dir?: string): OperationQueue {
	// One send at a time, so a change made while the queue is being sent isn't lost or sent out of order.
	let busy: Promise<unknown> = Promise.resolve();
	function serially<T>(task: () => Promise<T>): Promise<T> {
		const result = busy.then(task);
		busy = result.catch(() => undefined);
		return result;
	}
	const load = async () => (await readJson<Operation[]>(file, dir)) ?? [];

	return {
		read: () => serially(load),
		send: (request, more = []) =>
			serially(async () => {
				const waiting = await load();
				const operations = [...waiting, ...more];
				if (operations.length === 0) return operations;
				const left = await sendOperations(operations, request, name);
				// Only written when something waits, or waited, to spare the Pi's SD card.
				if (waiting.length > 0 || left.length > 0) await writeJson(file, left, dir);
				return left;
			})
	};
}

export interface BackendFeedOptions {
	/** Calls the backend as the Hub, or null until the Hub has the backend's settings and its certificate. */
	api: () => BackendRequest | null;
	/** Shown until then, and whenever `sampleOnly`. */
	sample: ShoppingSource;
	/** CALENDAR_SOURCE=sample. */
	sampleOnly: boolean;
	/** Whether the live connection is open, so the list can catch up less often. */
	live?: () => boolean;
	/** The data folder, for tests. */
	dir?: string;
	/** Milliseconds since 1970, for tests. */
	clock?: () => number;
	/** Told when changes that waited have all been sent, so the screen stops saying Offline. */
	sent?: () => void;
}

export interface BackendFeed extends Feed<{ text: string }, ShoppingItem> {
	/** Asks the backend for the list now, such as when a live update says it changed. */
	refresh(): Promise<void>;
	/** Sends any changes still waiting, such as when live updates reconnect. Asks for nothing if none are. */
	sendWaiting(): Promise<void>;
	/** The regulars to offer: the backend's, or the last it gave while it can't be reached, minus what's on the list. */
	regulars(): Promise<Regulars>;
	/** Adds each name as its own item, in one go: 200 once the backend has them, 202 while they wait. */
	addAll(names: string[]): Promise<200 | 202>;
	/** Stops a name being offered as a regular until it's added again: 200 or 202, as above. */
	dontSuggest(name: string): Promise<200 | 202>;
}

/**
 * The regulars worth offering, at most MOST_REGULARS: not on the list, ticked off or not, and not stopped by a
 * dont_suggest still waiting to be sent. The backend leaves those out too, but the Hub's list may be newer, or the
 * regulars from disk older.
 */
export function offerable(names: string[], items: ShoppingItem[], waiting: Operation[]): string[] {
	const left = new Set([
		...items.map((i) => matchName(i.text)),
		...waiting.flatMap((op) => (op.type === 'dont_suggest' ? [matchName(op.name)] : []))
	]);
	return names.filter((name) => !left.has(matchName(name))).slice(0, MOST_REGULARS);
}

export function createBackendFeed(options: BackendFeedOptions): BackendFeed {
	const queue = createOperationQueue(QUEUE_FILE, NAME, options.dir);
	let sync: Sync<ShoppingItem[]> | undefined;
	let retry: ReturnType<typeof setTimeout> | null = null;

	/** Sends what's waiting, then `more`, and tries again later while anything is left. */
	async function send(request: BackendRequest, more?: Operation[]): Promise<Operation[]> {
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
		// The list's fetch sends the queue first, so the list that comes back includes the changes.
		await live.sync.refresh({ fresh: true });
		if ((await queue.read()).length === 0) options.sent?.();
	}

	function listSync(request: BackendRequest): Sync<ShoppingItem[]> {
		sync ??= createSync({
			name: NAME,
			fetch: async () => {
				// Changes made while offline go first, so the list that comes back includes them.
				await send(request);
				const { items } = await request<{ items: BackendItem[] }>('GET', '/lists/shopping/items?after=0');
				return toShoppingItems(items);
			},
			everyMs: () => (options.live?.() ? CATCH_UP_MS : REFRESH_MS),
			load: async () => {
				const cached = await readJson<{ items: ShoppingItem[]; at: string }>(CACHE_FILE, options.dir);
				return cached && { value: cached.items, at: cached.at };
			},
			save: (k: Kept<ShoppingItem[]>) => writeJson(CACHE_FILE, { items: k.value, at: k.at }, options.dir),
			clock: options.clock
		});
		return sync;
	}

	function current() {
		const request = options.sampleOnly ? null : options.api();
		return request && { request, sync: listSync(request) };
	}

	/** Sends the operations behind any still waiting, and refreshes the list once they're in: 200, or 202 if they wait. */
	async function applyOperations(live: NonNullable<ReturnType<typeof current>>, operations: Operation[]) {
		const waiting = await send(live.request, operations);
		if (waiting.length > 0) return 202;
		// So the page the screen loads next shows the change.
		await live.sync.refresh({ fresh: true });
		return 200;
	}

	let regularsWritten: string | null = null;
	/** The backend's regulars, kept on disk when they change, or what's on disk if the backend can't be reached. */
	async function fetchRegulars(request: BackendRequest): Promise<{ names: string[]; offline: boolean }> {
		try {
			const { regulars } = await request<{ regulars: { name: string }[] }>(
				'GET',
				`/lists/shopping/regulars?limit=${MOST_REGULARS}`
			);
			const names = regulars.map((r) => r.name);
			const json = JSON.stringify(names);
			// Only written when they change, to spare the Pi's SD card.
			if (json !== regularsWritten) {
				await writeJson(REGULARS_FILE, names, options.dir);
				regularsWritten = json;
			}
			return { names, offline: false };
		} catch (e) {
			console.error(`${NAME}: couldn't get the regulars:`, why(e));
			return { names: (await readJson<string[]>(REGULARS_FILE, options.dir)) ?? [], offline: true };
		}
	}

	return {
		load: () =>
			orElse(
				NAME,
				async () => {
					const live = current();
					if (!live) return { items: await options.sample.list(), status: { kind: 'sample', setUp: false } };
					const [{ value, at, error }, waiting] = await Promise.all([live.sync.read(), queue.read()]);
					const items = withOperations(value ?? [], waiting);
					// A refused sign-in says Offline too, not Sign in needed: nothing at the Hub can fix it. The sync logs it.
					if (error || waiting.length > 0)
						return { items, status: { kind: 'stale', reason: 'offline', updatedAt: at, waiting: waiting.length } };
					return { items, status: { kind: 'live', updatedAt: at! } };
				},
				{ items: [], status: { kind: 'stale', reason: 'offline', updatedAt: null, waiting: 0 } }
			),

		async apply(change) {
			const live = current();
			if (!live) {
				if (change.action === 'add') await options.sample.add({ text: change.text });
				else if (change.action === 'tick') await options.sample.setTickedOff(change.id, change.tickedOff);
				else await options.sample.remove(change.id);
				return 200;
			}
			// Behind any changes still waiting, so they reach the backend in the order they were made.
			return applyOperations(live, [toOperation(change)]);
		},

		async regulars() {
			const live = current();
			if (!live) {
				const [names, items] = await Promise.all([options.sample.regulars(), options.sample.list()]);
				return { names: offerable(names, items, []), offline: false };
			}
			const [{ names, offline }, { value }, waiting] = await Promise.all([
				fetchRegulars(live.request),
				live.sync.read(),
				queue.read()
			]);
			return { names: offerable(names, withOperations(value ?? [], waiting), waiting), offline };
		},

		async addAll(names) {
			const live = current();
			if (!live) {
				for (const text of names) await options.sample.add({ text });
				return 200;
			}
			return applyOperations(
				live,
				names.map((text) => ({ id: randomUUID(), type: 'add', item_id: randomUUID(), text }))
			);
		},

		async dontSuggest(name) {
			const live = current();
			if (!live) {
				await options.sample.dontSuggest(name);
				return 200;
			}
			return applyOperations(live, [{ id: randomUUID(), type: 'dont_suggest', name }]);
		},

		async refresh() {
			await current()?.sync.refresh({ fresh: true });
		},

		sendWaiting
	};
}
