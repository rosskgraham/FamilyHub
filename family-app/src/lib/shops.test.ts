// Sorting the Shopping list for a Shop, and teaching it its walking order (AB#86).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBackend, ids } from './fakes.ts';
import { matchName, placeIn, ShoppingList, type ShopOperation } from './shopping.svelte.ts';

const texts = (list: ShoppingList) =>
	list.items.map((item) => (item.tickedOff ? `[x] ${item.text}` : item.placed ? `${item.text} *` : item.text));

/** A backend with items added in the order given, and Aldi, which has learned the walking order given. */
async function setUp(items: string[], aldi: string[] = []) {
	const backend = new FakeBackend();
	for (const text of items) backend.elsewhere('add', `item-${text}`, text);
	backend.apply({ id: 'shop-op', type: 'add_shop', shop_id: 'aldi', name: 'Aldi' });
	aldi.forEach((name, n) =>
		backend.apply({ id: `p-${n}`, type: 'place', shop_id: 'aldi', name, after: n ? aldi[n - 1]! : null })
	);
	const onchange = vi.fn();
	const list = new ShoppingList(backend, { onchange, newId: ids() });
	await list.load();
	return { backend, list, onchange };
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const sentShopOps = (backend: FakeBackend) =>
	backend.sent.flat().filter((op): op is ShopOperation => op.type === 'add_shop' || op.type === 'place');

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('matching names, as the backend does', () => {
	it.each([
		['Milk', 'milk'],
		[' milk ', 'milk'],
		['Milk.', 'milk'],
		['Milk !', 'milk'],
		['Washing-up   liquid', 'washing-up liquid'],
		['Co-op', 'co-op'],
		['Bread, sliced!', 'bread, sliced'],
		['Apples', 'apples']
	])('%j matches as %j', (text, matched) => {
		expect(matchName(text)).toBe(matched);
	});

	it('places a name straight after another, moving it, or at the start', () => {
		expect(placeIn(['bananas', 'milk', 'eggs'], 'Bread', 'Bananas')).toEqual(['bananas', 'bread', 'milk', 'eggs']);
		expect(placeIn(['bananas', 'milk', 'eggs'], 'Bananas', 'eggs.')).toEqual(['milk', 'eggs', 'bananas']);
		expect(placeIn(['bananas', 'milk'], 'Eggs', null)).toEqual(['eggs', 'bananas', 'milk']);
		expect(placeIn(['bananas', 'milk'], 'Eggs', 'Plasters')).toEqual(['eggs', 'bananas', 'milk']);
		expect(placeIn(['milk'], 'Milk', 'milk')).toEqual(['milk']);
	});
});

describe('picking a Shop', () => {
	it('offers the Shops by name, with none picked to start with, and the list newest first', async () => {
		const { list, backend } = await setUp(['Milk', 'Eggs', 'Bananas'], ['Milk']);
		backend.apply({ id: 'lidl-op', type: 'add_shop', shop_id: 'lidl', name: 'Lidl' });
		backend.apply({ id: 'coop-op', type: 'add_shop', shop_id: 'coop', name: 'Co-op' });
		await list.catchUp();

		expect(list.shops.map((shop) => shop.name)).toEqual(['Aldi', 'Co-op', 'Lidl']);
		expect(list.shop).toBeNull();
		expect(texts(list)).toEqual(['Bananas', 'Eggs', 'Milk']);
	});

	it("puts what the Shop hasn't placed first, newest first, then the rest in its walking order", async () => {
		const { list } = await setUp(
			['Eggs', 'Milk', 'Plasters', 'Bananas', 'Cheddar', 'Jam'],
			['Bananas', 'Cheddar', 'Milk', 'Eggs']
		);

		list.pick('aldi');

		expect(list.shop).toEqual({ id: 'aldi', name: 'Aldi' });
		expect(texts(list)).toEqual(['Jam', 'Plasters', 'Bananas *', 'Cheddar *', 'Milk *', 'Eggs *']);
	});

	it('keeps ticked-off items below, as now, and matches names however they were typed', async () => {
		const { list } = await setUp(['Eggs', 'milk.', 'Bananas'], ['Bananas', 'Milk', 'Eggs']);
		list.pick('aldi');

		list.toggle('item-Bananas');
		await settle();

		expect(texts(list)).toEqual(['milk. *', 'Eggs *', '[x] Bananas']);
	});

	it('goes back to newest first with no Shop picked', async () => {
		const { list } = await setUp(['Milk', 'Eggs'], ['Milk', 'Eggs']);
		list.pick('aldi');

		list.pick(null);

		expect(list.shop).toBeNull();
		expect(texts(list)).toEqual(['Eggs', 'Milk']);
	});

	it('keeps the pick in the phone’s copy, and opens with it picked', async () => {
		const { list, backend, onchange } = await setUp(['Milk', 'Eggs'], ['Milk']);
		list.pick('aldi');
		expect(onchange).toHaveBeenCalled();
		const saved = list.snapshot();
		expect(saved.shop).toBe('aldi');

		const reopened = new ShoppingList(backend, {});
		reopened.restore(saved);

		expect(reopened.shop).toEqual({ id: 'aldi', name: 'Aldi' });
		expect(texts(reopened)).toEqual(['Eggs', 'Milk *']);
		reopened.stop();
	});

	it('opens a copy saved before there were Shops, with none picked', async () => {
		const { list, backend } = await setUp(['Milk']);
		const { shops: _shops, shop: _shop, ...older } = list.snapshot();

		const reopened = new ShoppingList(backend, {});
		reopened.restore(older);

		expect(reopened.shop).toBeNull();
		expect(reopened.shops).toEqual([]);
		expect(texts(reopened)).toEqual(['Milk']);
		reopened.stop();
	});

	it('sorts newest first if the picked Shop is unknown', async () => {
		const { list } = await setUp(['Milk', 'Eggs']);

		list.pick('gone');

		expect(list.shop).toBeNull();
		expect(texts(list)).toEqual(['Eggs', 'Milk']);
	});
});

describe('adding a Shop', () => {
	it('adds it for the Household, picks it here, and shows it straight away', async () => {
		const { list, backend } = await setUp(['Milk', 'Eggs']);
		backend.failing = new Error('No signal');

		expect(list.addShop('  Co-op  ')).toBe(true);
		await settle();

		expect(list.shop?.name).toBe('Co-op');
		expect(list.shops.map((shop) => shop.name)).toEqual(['Aldi', 'Co-op']);
		// A new Shop has learned nothing, so everything is still to place.
		expect(texts(list)).toEqual(['Eggs', 'Milk']);
		expect(list.waiting).toBe(1);

		backend.failing = null;
		await list.refresh();
		expect(sentShopOps(backend).at(-1)).toMatchObject({ type: 'add_shop', name: 'Co-op' });
		expect(list.waiting).toBe(0);
		expect(list.shop?.name).toBe('Co-op');
	});

	it('refuses a name that is blank or over 50 characters', async () => {
		const { list } = await setUp([]);

		expect(list.addShop('   ')).toBe(false);
		expect(list.addShop('x'.repeat(51))).toBe(false);
		expect(list.addShop('x'.repeat(50))).toBe(true);
	});
});

describe('dragging an item into place', () => {
	it('places it after the nearest item above that the Shop knows, and it stays where it was dropped', async () => {
		const { list, backend } = await setUp(
			['Eggs', 'Milk', 'Plasters', 'Bananas', 'Cheddar'],
			['Bananas', 'Cheddar', 'Milk', 'Eggs']
		);
		list.pick('aldi');
		expect(texts(list)).toEqual(['Plasters', 'Bananas *', 'Cheddar *', 'Milk *', 'Eggs *']);

		// Dropped between Cheddar and Milk: position 2 among the others.
		list.place('item-Plasters', 2);

		expect(texts(list)).toEqual(['Bananas *', 'Cheddar *', 'Plasters *', 'Milk *', 'Eggs *']);
		await settle();
		expect(sentShopOps(backend)).toEqual([
			{ id: expect.any(String), type: 'place', shop_id: 'aldi', name: 'Plasters', after: 'Cheddar' }
		]);
		expect(backend.shops.get('aldi')?.order).toEqual(['bananas', 'cheddar', 'plasters', 'milk', 'eggs']);
	});

	it('places it at the start when dropped at the top, or among the items not placed yet', async () => {
		const { list, backend } = await setUp(['Eggs', 'Milk', 'Jam', 'Plasters'], ['Milk', 'Eggs']);
		list.pick('aldi');
		expect(texts(list)).toEqual(['Plasters', 'Jam', 'Milk *', 'Eggs *']);

		list.place('item-Eggs', 0);
		list.place('item-Jam', 1);
		await settle();

		expect(sentShopOps(backend).map((op) => op.type === 'place' && [op.name, op.after])).toEqual([
			['Eggs', null],
			['Jam', null]
		]);
		expect(texts(list)).toEqual(['Plasters', 'Jam *', 'Eggs *', 'Milk *']);
	});

	it('moves an item down the walking order', async () => {
		const { list } = await setUp(['Eggs', 'Milk', 'Bananas'], ['Bananas', 'Milk', 'Eggs']);
		list.pick('aldi');

		list.place('item-Bananas', 2);

		expect(texts(list)).toEqual(['Milk *', 'Eggs *', 'Bananas *']);
	});

	it('sends nothing when it is dropped where it was', async () => {
		const { list, backend } = await setUp(['Eggs', 'Milk'], ['Milk', 'Eggs']);
		list.pick('aldi');

		list.place('item-Eggs', 1);
		await settle();

		expect(sentShopOps(backend)).toEqual([]);
	});

	it('does nothing with no Shop picked, or for a ticked-off item', async () => {
		const { list, backend } = await setUp(['Eggs', 'Milk'], ['Milk', 'Eggs']);
		list.place('item-Eggs', 0);
		list.pick('aldi');
		list.toggle('item-Milk');
		await settle();

		list.place('item-Milk', 1);
		await settle();

		expect(sentShopOps(backend)).toEqual([]);
	});

	it('teaches the Shop with no signal, shows it straight away, and sends it later', async () => {
		const { list, backend } = await setUp(['Eggs', 'Milk', 'Bananas'], ['Bananas', 'Milk', 'Eggs']);
		list.pick('aldi');
		backend.failing = new Error('No signal');

		list.place('item-Eggs', 0);
		await settle();

		expect(texts(list)).toEqual(['Eggs *', 'Bananas *', 'Milk *']);
		expect(list.reach).toBe('offline');
		expect(list.waiting).toBe(1);
		// Kept in the phone's copy, so closing the app loses nothing.
		expect(list.snapshot().queue.map(({ op }) => op.type)).toEqual(['place']);

		backend.failing = null;
		await list.refresh();
		expect(list.waiting).toBe(0);
		expect(backend.shops.get('aldi')?.order).toEqual(['eggs', 'bananas', 'milk']);
		expect(texts(list)).toEqual(['Eggs *', 'Bananas *', 'Milk *']);
	});

	it('shows what another phone taught the Shop, once caught up', async () => {
		const { list, backend } = await setUp(['Eggs', 'Milk'], ['Milk', 'Eggs']);
		list.pick('aldi');

		backend.apply({ id: 'elsewhere', type: 'place', shop_id: 'aldi', name: 'Eggs', after: null });
		await list.catchUp();

		expect(texts(list)).toEqual(['Eggs *', 'Milk *']);
	});
});
