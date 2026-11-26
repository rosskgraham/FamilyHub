import { CALENDAR_SOURCE, SHOPPING_SOURCE } from '$app/env/private';
import type { ShoppingItem } from '#lib/shopping.ts';
import { backend } from '../backend/index.ts';
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
	sampleOnly: CALENDAR_SOURCE === 'sample'
});

/** The Shopping list: Google Tasks, or with SHOPPING_SOURCE=backend the backend's, for building only until slice 5. */
export const shopping = SHOPPING_SOURCE === 'backend' ? backendFeed : googleFeed;

export const loadShopping = (): Promise<ShoppingResult> => shopping.load();
