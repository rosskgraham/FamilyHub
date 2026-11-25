import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBackend, ids } from './fakes.ts';
import { Rejected, ShoppingList, SignedOut, TICKED_OFF_SHOWN_FOR, UNDO_FOR } from './shopping.svelte.ts';

const texts = (list: ShoppingList) => list.items.map((item) => (item.tickedOff ? `[x] ${item.text}` : item.text));

async function setUp(...start: string[]) {
	const backend = new FakeBackend();
	for (const text of start) backend.elsewhere('add', `start-${text}`, text);
	const onchange = vi.fn();
	const list = new ShoppingList(backend, { onchange, newId: ids() });
	await list.load();
	return { backend, list, onchange };
}

/** Lets the background sends and catch-ups finish. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('the Shopping list on the phone', () => {
	it('shows the backend items newest first, and how many to get', async () => {
		const { list } = await setUp('Milk', 'Eggs', 'Bananas');

		expect(texts(list)).toEqual(['Bananas', 'Eggs', 'Milk']);
		expect(list.toGet).toBe(3);
	});

	it('keeps ticked-off items below the rest, struck through, and in the same order when they change', async () => {
		const { list, backend } = await setUp('Milk', 'Eggs', 'Bananas');

		list.toggle('start-Bananas');
		await settle();
		backend.elsewhere('rename', 'start-Milk', 'Oat milk');
		await list.catchUp();

		expect(texts(list)).toEqual(['Eggs', 'Oat milk', '[x] Bananas']);
		expect(list.toGet).toBe(2);
	});

	it('drops a ticked-off item once its 10 minutes are up', async () => {
		const { list } = await setUp('Milk', 'Eggs');
		list.toggle('start-Milk');
		await settle();

		await vi.advanceTimersByTimeAsync(TICKED_OFF_SHOWN_FOR - 30_000);
		expect(texts(list)).toEqual(['Eggs', '[x] Milk']);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(texts(list)).toEqual(['Eggs']);
	});

	it('shows nothing to get when the list is empty', async () => {
		const { list } = await setUp();

		expect(list.items).toEqual([]);
		expect(list.toGet).toBe(0);
	});
});

describe('changes made on the phone', () => {
	it('adds an item at the top straight away, with ids made on the phone, and sends it', async () => {
		const { list, backend } = await setUp('Milk');

		expect(list.add('  Pasta ')).toBe(true);

		expect(texts(list)).toEqual(['Pasta', 'Milk']);
		await settle();
		expect(backend.sent).toEqual([[{ id: 'id-1', type: 'add', item_id: 'id-2', text: 'Pasta' }]]);
		expect(backend.items.get('id-2')?.text).toBe('Pasta');
		expect(texts(list)).toEqual(['Pasta', 'Milk']);
	});

	it("doesn't add empty text or text over 200 characters", async () => {
		const { list, backend } = await setUp();

		expect(list.add('   ')).toBe(false);
		expect(list.add('x'.repeat(201))).toBe(false);
		expect(list.add('x'.repeat(200))).toBe(true);
		await settle();

		expect(backend.sent.flat().map((op) => op.type)).toEqual(['add']);
	});

	it('ticks and unticks straight away, and sends each', async () => {
		const { list, backend } = await setUp('Milk');

		list.toggle('start-Milk');
		expect(texts(list)).toEqual(['[x] Milk']);
		await settle();
		list.toggle('start-Milk');
		expect(texts(list)).toEqual(['Milk']);
		await settle();

		expect(backend.sent.flat().map((op) => [op.type, 'item_id' in op ? op.item_id : op.shop_id])).toEqual([
			['tick', 'start-Milk'],
			['untick', 'start-Milk']
		]);
		expect(backend.items.get('start-Milk')?.ticked_off).toBe(false);
	});

	it('renames straight away, and sends nothing when the text is unchanged', async () => {
		const { list, backend } = await setUp('Milk');

		expect(list.rename('start-Milk', 'Milk ')).toBe(false);
		expect(list.rename('start-Milk', '')).toBe(false);
		expect(list.rename('start-Milk', 'Oat milk')).toBe(true);

		expect(texts(list)).toEqual(['Oat milk']);
		await settle();
		expect(backend.sent.flat()).toEqual([{ id: 'id-1', type: 'rename', item_id: 'start-Milk', text: 'Oat milk' }]);
	});
});

describe('removing, with Undo', () => {
	it('takes the item off straight away, and sends the remove once Undo has gone', async () => {
		const { list, backend } = await setUp('Milk', 'Eggs');

		list.remove('start-Milk');

		expect(texts(list)).toEqual(['Eggs']);
		expect(list.undoable).toBe('Milk');
		await vi.advanceTimersByTimeAsync(UNDO_FOR - 100);
		expect(backend.sent).toEqual([]);

		await vi.advanceTimersByTimeAsync(200);
		expect(list.undoable).toBeNull();
		expect(backend.sent.flat()).toEqual([{ id: 'id-1', type: 'remove', item_id: 'start-Milk' }]);
		expect(texts(list)).toEqual(['Eggs']);
	});

	it('puts the item back on Undo, and sends nothing', async () => {
		const { list, backend } = await setUp('Milk', 'Eggs');

		list.remove('start-Milk');
		list.undo();
		await vi.advanceTimersByTimeAsync(UNDO_FOR * 2);

		expect(texts(list)).toEqual(['Eggs', 'Milk']);
		expect(list.undoable).toBeNull();
		expect(backend.sent).toEqual([]);
	});

	it('sends the remove at once when the app is put away', async () => {
		const { list, backend } = await setUp('Milk');

		list.remove('start-Milk');
		list.hidden();
		await settle();

		expect(backend.items.get('start-Milk')?.removed).toBe(true);
		expect(list.undoable).toBeNull();
	});

	it('sends the first remove when a second is made, and Undo then brings back only the second', async () => {
		const { list, backend } = await setUp('Milk', 'Eggs', 'Bananas');

		list.remove('start-Milk');
		list.remove('start-Eggs');
		await settle();
		expect(backend.items.get('start-Milk')?.removed).toBe(true);
		expect(list.undoable).toBe('Eggs');

		list.undo();
		expect(texts(list)).toEqual(['Bananas', 'Eggs']);
	});
});

describe('sending, and when it fails', () => {
	it('keeps a change showing while sending fails, and sends the same operation again later', async () => {
		const { list, backend } = await setUp('Milk');
		backend.failing = new TypeError('Failed to fetch');

		list.toggle('start-Milk');
		await settle();
		expect(texts(list)).toEqual(['[x] Milk']);
		expect(backend.sent).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(backend.sent).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1_999);
		expect(backend.sent).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(backend.sent).toHaveLength(3);

		backend.failing = null;
		await vi.advanceTimersByTimeAsync(4_000);
		expect(backend.sent).toHaveLength(4);
		expect(new Set(backend.sent.map((batch) => batch[0]!.id))).toEqual(new Set(['id-1']));
		expect(backend.items.get('start-Milk')?.ticked_off).toBe(true);
		expect(texts(list)).toEqual(['[x] Milk']);
	});

	it('sends changes made while one is on its way, in the order they were made', async () => {
		const { list, backend } = await setUp();

		list.add('Milk');
		list.add('Eggs');
		list.toggle('id-2');
		await settle();

		expect(backend.sent.flat().map((op) => op.type)).toEqual(['add', 'add', 'tick']);
		expect(texts(list)).toEqual(['Eggs', '[x] Milk']);
	});

	it('applies an operation once even when it is sent again', async () => {
		const { list, backend } = await setUp();
		// The backend applies it, but the answer is lost on the way back.
		const send = backend.send.bind(backend);
		backend.send = async (operations) => {
			await send(operations);
			backend.send = send;
			throw new TypeError('Failed to fetch');
		};

		list.add('Milk');
		await vi.advanceTimersByTimeAsync(1_000);

		expect(backend.sent).toHaveLength(2);
		expect(backend.seq).toBe(1);
		expect(texts(list)).toEqual(['Milk']);
	});

	it('sends anything waiting when the app comes back to the front', async () => {
		const { list, backend } = await setUp('Milk');
		backend.failing = new TypeError('Failed to fetch');
		list.toggle('start-Milk');
		await settle();

		backend.failing = null;
		await list.visible();

		expect(backend.items.get('start-Milk')?.ticked_off).toBe(true);
	});

	it('asks to sign in again when the backend says 401, keeping the change and not trying again until then', async () => {
		const { list, backend } = await setUp('Milk');
		backend.failing = new SignedOut();

		list.toggle('start-Milk');
		await vi.advanceTimersByTimeAsync(60_000);

		expect(list.reach).toBe('signed-out');
		expect(backend.sent).toHaveLength(1);
		expect(texts(list)).toEqual(['[x] Milk']);
		expect(list.waiting).toBe(1);
	});

	it('drops a batch the backend refuses as invalid, as it would never be accepted', async () => {
		const { list, backend } = await setUp('Milk');
		backend.failing = new Rejected('422');

		list.rename('start-Milk', 'Oat milk');
		await vi.advanceTimersByTimeAsync(10_000);

		expect(backend.sent).toHaveLength(1);
		expect(texts(list)).toEqual(['Milk']);
	});
});

describe('changes made elsewhere', () => {
	it('show after a send, and when the app comes back to the front', async () => {
		const { list, backend } = await setUp('Milk');

		backend.elsewhere('add', 'hub-1', 'Plasters');
		list.add('Eggs');
		await settle();
		expect(texts(list)).toEqual(['Eggs', 'Plasters', 'Milk']);

		backend.elsewhere('remove', 'start-Milk');
		backend.elsewhere('tick', 'hub-1');
		await list.visible();
		expect(texts(list)).toEqual(['Eggs', '[x] Plasters']);
	});

	it("don't undo the phone's own change that hasn't been sent yet", async () => {
		const { list, backend } = await setUp('Milk');
		backend.failing = new TypeError('Failed to fetch');
		list.rename('start-Milk', 'Oat milk');
		await settle();

		backend.elsewhere('tick', 'start-Milk');
		await list.catchUp();

		expect(texts(list)).toEqual(['[x] Oat milk']);
	});

	it('a catch-up that fails waits for the next one', async () => {
		const { list, backend } = await setUp('Milk');
		backend.failChanges = new TypeError('Failed to fetch');
		backend.elsewhere('add', 'hub-1', 'Plasters');

		await list.catchUp();
		expect(texts(list)).toEqual(['Milk']);

		backend.failChanges = null;
		await list.catchUp();
		expect(texts(list)).toEqual(['Plasters', 'Milk']);
	});

	it('a removed item never comes back, even from an answer that arrives late', async () => {
		const { list, backend } = await setUp('Milk');
		const before = await backend.changes(0);
		backend.elsewhere('remove', 'start-Milk');
		await list.catchUp();
		expect(texts(list)).toEqual([]);

		// An answer from before the remove, arriving after it.
		backend.changes = async () => before;
		await list.catchUp();

		expect(texts(list)).toEqual([]);
	});
});

describe("the phone's copy (AB#58)", () => {
	it('is saved after every change, and a list started from it has the same items and unsent changes', async () => {
		const { list, backend, onchange } = await setUp('Milk', 'Eggs');
		backend.failing = new TypeError('Failed to fetch');

		list.add('Pasta');
		list.toggle('start-Milk');
		list.rename('start-Eggs', 'Big eggs');
		await settle();
		expect(onchange).toHaveBeenCalledTimes(3);

		// The app's closed and opened again, still with no signal.
		const saved = structuredClone(list.snapshot());
		list.stop();
		const again = new ShoppingList(backend, { newId: ids() });
		again.restore(saved);

		expect(texts(again)).toEqual(['Pasta', 'Big eggs', '[x] Milk']);
		expect(again.waiting).toBe(3);
		expect(again.items.every((item) => item.waiting)).toBe(true);

		// The signal's back.
		backend.failing = null;
		await again.refresh();
		expect(backend.items.get('start-Milk')?.ticked_off).toBe(true);
		expect(backend.items.get('start-Eggs')?.text).toBe('Big eggs');
		expect([...backend.items.values()].map((item) => item.text)).toContain('Pasta');
		expect(again.waiting).toBe(0);
		expect(again.items.some((item) => item.waiting)).toBe(false);
		again.stop();
	});

	it('keeps a removed item gone after starting again from the copy', async () => {
		const { list, backend } = await setUp('Milk');
		backend.elsewhere('remove', 'start-Milk');
		await list.catchUp();
		const stale = { items: [{ ...backend.items.get('start-Milk')!, removed: false, seq: 1 }], seq: 1 };

		const again = new ShoppingList(backend);
		again.restore(structuredClone(list.snapshot()));
		backend.changes = async () => stale;
		await again.catchUp();

		expect(texts(again)).toEqual([]);
		again.stop();
	});

	it("doesn't keep a remove waiting for its Undo, which is sent when the app's put away instead", async () => {
		const { list } = await setUp('Milk');

		list.remove('start-Milk');

		expect(list.snapshot().queue).toEqual([]);
	});
});

describe('whether the backend can be reached (AB#58)', () => {
	it('is offline when a send fails, back to ok when one succeeds, with each waiting item marked', async () => {
		const { list, backend } = await setUp('Milk', 'Eggs');
		backend.failing = new TypeError('Failed to fetch');

		list.toggle('start-Milk');
		await settle();
		expect(list.reach).toBe('offline');
		expect(list.waiting).toBe(1);
		expect(list.items.map((item) => [item.text, item.waiting])).toEqual([
			['Eggs', false],
			['Milk', true]
		]);

		backend.failing = null;
		await vi.advanceTimersByTimeAsync(1_000);
		expect(list.reach).toBe('ok');
		expect(list.waiting).toBe(0);
	});

	it('is offline when a catch-up fails, and keeps trying until it works', async () => {
		const { list, backend } = await setUp('Milk');
		backend.failChanges = new TypeError('Failed to fetch');
		backend.elsewhere('add', 'hub-1', 'Plasters');

		await list.catchUp();
		expect(list.reach).toBe('offline');

		backend.failChanges = null;
		await vi.advanceTimersByTimeAsync(1_000);
		expect(list.reach).toBe('ok');
		expect(texts(list)).toEqual(['Plasters', 'Milk']);
	});
});

describe('live updates (AB#59)', () => {
	it('catch up when a message is past what the list has, and not otherwise', async () => {
		const { list, backend } = await setUp('Milk');
		const changes = vi.spyOn(backend, 'changes');

		await list.heard(1);
		expect(changes).not.toHaveBeenCalled();

		backend.elsewhere('add', 'hub-1', 'Plasters');
		await list.heard(2);
		expect(changes).toHaveBeenCalledWith(1);
		expect(texts(list)).toEqual(['Plasters', 'Milk']);
	});
});
