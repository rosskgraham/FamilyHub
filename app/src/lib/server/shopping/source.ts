import type { ShoppingItem } from '#lib/shopping.ts';

export interface ShoppingSource {
	/** Items still to get, then items ticked off today. Items ticked off before today are left out. */
	list(): Promise<ShoppingItem[]>;
	add(text: string): Promise<void>;
	setTickedOff(id: string, tickedOff: boolean): Promise<void>;
	remove(id: string): Promise<void>;
}
