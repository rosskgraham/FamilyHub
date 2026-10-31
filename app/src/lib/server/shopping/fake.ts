import type { ShoppingItem } from '#lib/shopping.ts';
import { dayKey } from '#lib/time.ts';
import { now } from '../now.ts';
import type { ShoppingSource } from './source.ts';

// A sample list kept in memory, so ticking, adding and removing can be tried
// without Google. It resets when the app restarts.
interface FakeItem {
	id: string;
	text: string;
	tickedOffAt: Date | null;
}

let nextId = 1;
const item = (text: string, tickedOffAt: Date | null = null): FakeItem => ({ id: `sample-${nextId++}`, text, tickedOffAt });

const items: FakeItem[] = [
	item('Milk'),
	item('Eggs'),
	item('Bananas'),
	item('Cheddar'),
	item('Washing-up liquid'),
	item('Lunchbox snacks'),
	item('Wholemeal bread', now())
];

export const fakeShopping: ShoppingSource = {
	async list() {
		const today = dayKey(now());
		const toGet = items.filter((i) => !i.tickedOffAt);
		const ticked = items.filter((i) => i.tickedOffAt && dayKey(i.tickedOffAt) === today);
		return [...toGet, ...ticked].map(
			(i): ShoppingItem => ({ id: i.id, text: i.text, tickedOff: i.tickedOffAt !== null })
		);
	},
	async add(text) {
		const added = item(text);
		items.unshift(added);
		return added.id;
	},
	async setTickedOff(id, tickedOff) {
		const found = items.find((i) => i.id === id);
		if (found) found.tickedOffAt = tickedOff ? now() : null;
	},
	async remove(id) {
		const index = items.findIndex((i) => i.id === id);
		if (index >= 0) items.splice(index, 1);
	}
};
