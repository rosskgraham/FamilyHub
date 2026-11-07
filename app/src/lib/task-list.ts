// What the Shopping list and To-dos have in common: each is a Google Tasks list, shown and changed at the Hub.

/** What an add carries: the text, plus a due date for a To-do. */
export interface Addition {
	text: string;
}

/** An item on screen: what was added, with its id and whether it's ticked off. */
export type Item<A extends Addition> = A & { id: string; tickedOff: boolean };

/** What the screen asks the server to change. To-dos can't be removed, so they never send `remove`. */
export type Change<A extends Addition> =
	({ action: 'add' } & A) | { action: 'tick'; id: string; tickedOff: boolean } | { action: 'remove'; id: string };

/** Where a list on screen came from, and how fresh it is. */
export type ListStatus =
	| { kind: 'sample'; setUp: boolean }
	| { kind: 'live'; updatedAt: string }
	| {
			kind: 'stale';
			reason: 'sign-in' | 'offline';
			updatedAt: string | null;
			/** Changes waiting to be sent. */ waiting: number;
	  };
