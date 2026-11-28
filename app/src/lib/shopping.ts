import type { Change, Item, ListStatus } from './task-list.ts';

export type ShoppingItem = Item<{ text: string }>;

/** Where the Shopping list on screen came from, and how fresh it is. */
export type ShoppingStatus = ListStatus;

/** What the screen asks the server to change. */
export type ShoppingChange = Change<{ text: string }>;

/** The Household's regulars, best first, leaving out what's on the list (AB#110). */
export interface Regulars {
	names: string[];
	/** The backend couldn't be reached, so these are the last ones it gave. */
	offline: boolean;
}

/** The most regulars the Hub offers at once. */
export const MOST_REGULARS = 24;

/**
 * The form item names are matched in, as the backend's match_name does, so "Milk", " milk " and "Milk." are one name.
 * Plurals aren't merged: "apple" and "apples" are two.
 */
export function matchName(text: string): string {
	return text
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.join(' ')
		.replace(/[!-/:-@[-`{-~]+$/, '')
		.trimEnd();
}
