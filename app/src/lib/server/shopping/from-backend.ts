import { randomUUID } from 'node:crypto';
import type { ShoppingChange, ShoppingItem } from '#lib/shopping.ts';

/** An item as GET /lists/shopping/items gives it. See backend/README.md (The Shopping list). */
export interface BackendItem {
	id: string;
	text: string;
	ticked_off: boolean;
	ticked_off_at: string | null;
	removed: boolean;
	seq: number;
	added_seq: number;
}

/** A change as POST /lists/shopping/operations takes it. Both ids are made on the Hub, so a resend changes nothing. */
export type Operation =
	| { id: string; type: 'add'; item_id: string; text: string }
	| { id: string; type: 'tick' | 'untick' | 'remove'; item_id: string }
	// Stops a name being offered as a regular until it's added again (AB#109).
	| { id: string; type: 'dont_suggest'; name: string };

/** An operation on one item. */
export type ItemOperation = Exclude<Operation, { type: 'dont_suggest' }>;

/**
 * Items still to get, newest first, then items ticked off in the last few minutes. With after=0 the backend sends only
 * those, so it's just a matter of order, and leaving out a removed item should one come.
 */
export function toShoppingItems(items: BackendItem[]): ShoppingItem[] {
	const newestFirst = (a: BackendItem, b: BackendItem) => b.added_seq - a.added_seq;
	const usable = items.filter((i) => !i.removed);
	const toGet = usable.filter((i) => !i.ticked_off).sort(newestFirst);
	const ticked = usable.filter((i) => i.ticked_off).sort(newestFirst);
	return [...toGet, ...ticked].map((i) => ({ id: i.id, text: i.text, tickedOff: i.ticked_off }));
}

/** The operation for a change at the Hub. An added item gets its id here, so it never needs swapping for another. */
export function toOperation(change: ShoppingChange, newId: () => string = randomUUID): ItemOperation {
	if (change.action === 'add') return { id: newId(), type: 'add', item_id: newId(), text: change.text };
	if (change.action === 'tick') return { id: newId(), type: change.tickedOff ? 'tick' : 'untick', item_id: change.id };
	return { id: newId(), type: 'remove', item_id: change.id };
}

/** The list as it will be once the operations waiting are sent. */
export function withOperations(items: ShoppingItem[], operations: Operation[]): ShoppingItem[] {
	let result = items;
	for (const op of operations) {
		if (op.type === 'add') result = [{ id: op.item_id, text: op.text, tickedOff: false }, ...result];
		else if (op.type === 'remove') result = result.filter((i) => i.id !== op.item_id);
		else if (op.type === 'tick' || op.type === 'untick')
			result = result.map((i) => (i.id === op.item_id ? { ...i, tickedOff: op.type === 'tick' } : i));
	}
	return result;
}
