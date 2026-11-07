import type { Change, Item, ListStatus } from './task-list.ts';

export type ShoppingItem = Item<{ text: string }>;

/** Where the Shopping list on screen came from, and how fresh it is. */
export type ShoppingStatus = ListStatus;

/** What the screen asks the server to change. */
export type ShoppingChange = Change<{ text: string }>;
