import type { ShoppingItem } from '#lib/shopping.ts';
import { createFeed, type ListResult } from '../tasks/feed.ts';
import { fakeShopping } from './fake.ts';
import { googleShopping } from './google.ts';

export type ShoppingResult = ListResult<ShoppingItem>;

/** The Shopping list: the chosen Google Tasks list once the Hub is set up, otherwise a sample one. */
export const shopping = createFeed({
	name: 'Shopping list',
	listId: (settings) => settings.shoppingList,
	sample: fakeShopping,
	google: googleShopping,
	cacheFile: 'shopping-cache.json',
	queueFile: 'shopping-queue.json'
});

export const loadShopping = (): Promise<ShoppingResult> => shopping.load();
