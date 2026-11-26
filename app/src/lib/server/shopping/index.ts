import { CALENDAR_SOURCE, SHOPPING_SOURCE } from '$app/env/private';
import type { ShoppingItem } from '#lib/shopping.ts';
import { backend } from '../backend/index.ts';
import { liveConnected } from '../backend/live.ts';
import { announceListChanged } from '../changes.ts';
import { createFeed, type ListResult } from '../tasks/feed.ts';
import { createBackendFeed } from './backend.ts';
import { fakeShopping } from './fake.ts';
import { googleShopping } from './google.ts';

export type ShoppingResult = ListResult<ShoppingItem>;

/** The chosen Google Tasks list once the Hub is set up, otherwise a sample one. */
export const googleFeed = createFeed({
	name: 'Shopping list',
	listId: (settings) => settings.shoppingList,
	sample: fakeShopping,
	google: googleShopping,
	cacheFile: 'shopping-cache.json',
	queueFile: 'shopping-queue.json'
});

/** The backend's, once the Hub has its settings and certificate, otherwise a sample one. */
export const backendFeed = createBackendFeed({
	api: () => backend()?.request ?? null,
	sample: fakeShopping,
	sampleOnly: CALENDAR_SOURCE === 'sample',
	live: liveConnected
});

/** The Shopping list: Google Tasks, or with SHOPPING_SOURCE=backend the backend's, for building only until slice 5. */
export const shopping = SHOPPING_SOURCE === 'backend' ? backendFeed : googleFeed;

export const loadShopping = (): Promise<ShoppingResult> => shopping.load();

/** Whether the Shopping list on screen is the backend's, which live updates keep fresh. */
export const shoppingIsLive = (): boolean =>
	shopping === backendFeed && CALENDAR_SOURCE !== 'sample' && backend() !== null;

/**
 * A live update from the backend. A change to the Shopping list is fetched, then the screen is told, when the list on
 * screen is the backend's. Other lists' messages are ignored, as is everything while the Hub shows Google Tasks.
 */
export async function onLiveMessage(list: string): Promise<void> {
	if (list !== 'shopping' || !shoppingIsLive()) return;
	await backendFeed.refresh();
	announceListChanged('shopping');
}
