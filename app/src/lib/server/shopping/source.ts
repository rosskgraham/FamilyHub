import type { ShoppingItem } from '#lib/shopping.ts';
import type { ChangeTarget } from '../tasks/queue.ts';

export interface ShoppingSource extends ChangeTarget<{ text: string }> {
	/** Items still to get, then items ticked off today. Items ticked off before today are left out. */
	list(): Promise<ShoppingItem[]>;
}
