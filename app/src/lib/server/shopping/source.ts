import type { ShoppingItem } from '#lib/shopping.ts';

export interface ShoppingSource {
	/** Items still to get, then items ticked off today. Items ticked off before today are left out. */
	list(): Promise<ShoppingItem[]>;
	/** Resolves to the new item's id. */
	add(text: string): Promise<string>;
	setTickedOff(id: string, tickedOff: boolean): Promise<void>;
	remove(id: string): Promise<void>;
}
