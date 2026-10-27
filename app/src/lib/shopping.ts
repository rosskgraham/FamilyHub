export interface ShoppingItem {
	id: string;
	text: string;
	tickedOff: boolean;
}

/** Where the Shopping list on screen came from, and how fresh it is. */
export type ShoppingStatus =
	| { kind: 'sample'; setUp: boolean }
	| { kind: 'live'; updatedAt: string }
	| { kind: 'stale'; reason: 'sign-in' | 'offline'; updatedAt: string | null };

/** What the screen asks the server to change. */
export type ShoppingChange =
	| { action: 'add'; text: string }
	| { action: 'tick'; id: string; tickedOff: boolean }
	| { action: 'remove'; id: string };
