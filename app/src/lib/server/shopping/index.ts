import { CALENDAR_SOURCE } from '$app/env/private';
import type { ShoppingItem, ShoppingStatus } from '#lib/shopping.ts';
import { isConfigured, isSignedIn, SignInNeeded } from '../google/auth.ts';
import { orElse } from '../fallback.ts';
import { readSettings } from '../settings.ts';
import { readJson, writeJson } from '../store.ts';
import { createSync, type Kept, type Sync } from '../sync.ts';
import { fakeShopping } from './fake.ts';
import { googleShopping } from './google.ts';
import { readQueue, sendQueue, withQueue } from './queue.ts';
import type { ShoppingSource } from './source.ts';

export interface ShoppingResult {
	items: ShoppingItem[];
	status: ShoppingStatus;
}

// The last good list, shown if Google can't be reached. It's kept on disk too, for when the Hub restarts offline.
const CACHE_FILE = 'shopping-cache.json';
// Changes at the Hub refresh it straight away; this is for changes made on phones.
const REFRESH_MS = 60_000;

let sync: { listId: string; list: Sync<ShoppingItem[]> } | undefined;

/** The background sync for one Google Tasks list, started again if a different list is chosen. */
function listSync(listId: string, source: ShoppingSource): Sync<ShoppingItem[]> {
	if (sync?.listId !== listId) {
		const list = createSync({
			name: 'Shopping list',
			fetch: async () => {
				// Changes made while offline go first, so the list Google sends back includes them.
				await sendQueue(source);
				return source.list();
			},
			everyMs: REFRESH_MS,
			load: async () => {
				const cached = await readJson<{ items: ShoppingItem[]; at: string }>(CACHE_FILE);
				return cached && { value: cached.items, at: cached.at };
			},
			save: (k: Kept<ShoppingItem[]>) => writeJson(CACHE_FILE, { items: k.value, at: k.at })
		});
		sync = { listId, list };
	}
	return sync.list;
}

/**
 * The Google Tasks list once the Hub is signed in and a list is chosen, otherwise the sample list.
 * CALENDAR_SOURCE=sample forces the sample list too.
 */
export async function shoppingSource(): Promise<{
	source: ShoppingSource;
	live: boolean;
	setUp: boolean;
	listId?: string;
}> {
	const { shoppingList } = await readSettings();
	const setUp = isConfigured() && shoppingList !== undefined && (await isSignedIn());
	if (CALENDAR_SOURCE === 'sample' || !setUp) return { source: fakeShopping, live: false, setUp };
	return { source: googleShopping(shoppingList!), live: true, setUp, listId: shoppingList };
}

export function loadShopping(): Promise<ShoppingResult> {
	return orElse('Shopping list', loadList, {
		items: [],
		status: { kind: 'stale', reason: 'offline', updatedAt: null, waiting: 0 }
	});
}

async function loadList(): Promise<ShoppingResult> {
	const { source, live, setUp, listId } = await shoppingSource();
	if (!live) return { items: await source.list(), status: { kind: 'sample', setUp } };
	const [{ value, at, error }, waiting] = await Promise.all([listSync(listId!, source).read(), readQueue()]);
	const items = withQueue(value ?? [], waiting);
	if (error) {
		const reason = error instanceof SignInNeeded ? 'sign-in' : 'offline';
		return { items, status: { kind: 'stale', reason, updatedAt: at, waiting: waiting.length } };
	}
	if (waiting.length > 0)
		return { items, status: { kind: 'stale', reason: 'offline', updatedAt: at, waiting: waiting.length } };
	return { items, status: { kind: 'live', updatedAt: at! } };
}

/** Fetches the list again now, after a change at the Hub, so the screen shows it straight away. */
export async function refreshShopping(): Promise<void> {
	const { source, live, listId } = await shoppingSource();
	if (live) await listSync(listId!, source).refresh();
}
