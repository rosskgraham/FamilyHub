import { CALENDAR_SOURCE } from '$app/env/private';
import type { ShoppingItem, ShoppingStatus } from '#lib/shopping.ts';
import { isConfigured, isSignedIn, SignInNeeded } from '../google/auth.ts';
import { readSettings } from '../settings.ts';
import { readJson, writeJson } from '../store.ts';
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
const REWRITE_MS = 60 * 60_000;
type Cached = { items: ShoppingItem[]; at: string };
let lastGood: Cached | null | undefined;
let written = 0;

async function remembered(): Promise<Cached | null> {
	if (lastGood === undefined) lastGood = await readJson<Cached>(CACHE_FILE);
	return lastGood;
}

async function remember(items: ShoppingItem[]): Promise<Cached> {
	const changed = JSON.stringify((await remembered())?.items) !== JSON.stringify(items);
	lastGood = { items, at: new Date().toISOString() };
	// When the list changes, and otherwise hourly to keep the time fresh: every minute would wear out the Pi's SD card.
	if (changed || Date.now() - written > REWRITE_MS) {
		await writeJson(CACHE_FILE, lastGood);
		written = Date.now();
	}
	return lastGood;
}

/**
 * The Google Tasks list once the Hub is signed in and a list is chosen, otherwise the sample list.
 * CALENDAR_SOURCE=sample forces the sample list too.
 */
export async function shoppingSource(): Promise<{ source: ShoppingSource; live: boolean; setUp: boolean }> {
	const { shoppingList } = await readSettings();
	const setUp = isConfigured() && shoppingList !== undefined && (await isSignedIn());
	if (CALENDAR_SOURCE === 'sample' || !setUp) return { source: fakeShopping, live: false, setUp };
	return { source: googleShopping(shoppingList!), live: true, setUp };
}

export async function loadShopping(): Promise<ShoppingResult> {
	const { source, live, setUp } = await shoppingSource();
	if (!live) return { items: await source.list(), status: { kind: 'sample', setUp } };
	try {
		// Changes made while offline go first, so the list Google sends back includes them.
		const waiting = await sendQueue(source);
		const { items, at } = await remember(await source.list());
		if (waiting.length === 0) return { items, status: { kind: 'live', updatedAt: at } };
		return { items: withQueue(items, waiting), status: { kind: 'stale', reason: 'offline', updatedAt: at, waiting: waiting.length } };
	} catch (e) {
		const reason = e instanceof SignInNeeded ? 'sign-in' : 'offline';
		if (reason === 'offline') console.error('Shopping list sync failed:', e);
		const [last, waiting] = await Promise.all([remembered(), readQueue()]);
		return {
			items: withQueue(last?.items ?? [], waiting),
			status: { kind: 'stale', reason, updatedAt: last?.at ?? null, waiting: waiting.length }
		};
	}
}
