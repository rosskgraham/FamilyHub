import type { ShoppingItem } from '#lib/shopping.ts';
import type { ChangeTarget } from '../tasks/queue.ts';

export interface ShoppingSource extends ChangeTarget<{ text: string }> {
	/** Items still to get, then items ticked off in the last 10 minutes, so a mis-tap can be undone. Older ones are left out. */
	list(): Promise<ShoppingItem[]>;
	/** The regulars, best first, before leaving out what's on the list (AB#110). */
	regulars(): Promise<string[]>;
	/** Stops one being offered until it's added again. */
	dontSuggest(name: string): Promise<void>;
}
