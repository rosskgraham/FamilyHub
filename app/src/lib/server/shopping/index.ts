import { CALENDAR_SOURCE } from '$app/env/private';
import type { ShoppingItem, ShoppingStatus } from '#lib/shopping.ts';
import { isConfigured, isSignedIn, SignInNeeded } from '../google/auth.ts';
import { readSettings } from '../settings.ts';
import { fakeShopping } from './fake.ts';
import { googleShopping } from './google.ts';
import type { ShoppingSource } from './source.ts';

export interface ShoppingResult {
	items: ShoppingItem[];
	status: ShoppingStatus;
}

// The last good list, shown if Google can't be reached.
let lastGood: { items: ShoppingItem[]; at: string } | null = null;

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
		const items = await source.list();
		lastGood = { items, at: new Date().toISOString() };
		return { items, status: { kind: 'live', updatedAt: lastGood.at } };
	} catch (e) {
		const reason = e instanceof SignInNeeded ? 'sign-in' : 'offline';
		if (reason === 'offline') console.error('Shopping list sync failed:', e);
		return {
			items: lastGood?.items ?? [],
			status: { kind: 'stale', reason, updatedAt: lastGood?.at ?? null }
		};
	}
}
