import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	Rejected,
	ShoppingList,
	SignedOut,
	TICKED_OFF_SHOWN_FOR,
	UNDO_FOR,
	type Changes,
	type ListApi,
	type Operation,
	type ServerItem
} from './shopping.svelte.ts';

/** The backend's Shopping list in memory, merging as backend/familyhub_api/lists.py does. */
class FakeBackend implements ListApi {
	items = new Map<string, ServerItem>();
	seq = 0;
	applied = new Set<string>();
	sent: Operation[][] = [];
	failing: Error | null = null;
	failChanges: Error | null = null;

	async send(operations: Operation[]): Promise<void> {
		this.sent.push(operations);
		if (this.failing) throw this.failing;
		for (const op of operations) this.apply(op);
	}

	async changes(after: number): Promise<Changes> {
		if (this.failChanges) throw this.failChanges;
		const items = [...this.items.values()].filter(
			(item) => item.seq > after && (after > 0 || (!item.removed && !item.ticked_off))
		);
		return structuredClone({ items, seq: this.seq });
	}

	apply(op: Operation): void {
		if (this.applied.has(op.id)) return;
		this.applied.add(op.id);
		const seq = ++this.seq;
		const item = this.items.get(op.item_id);
		if (op.type === 'add') {
			if (!item) {
				this.items.set(op.item_id, {
					id: op.item_id,
					text: op.text,
					ticked_off: false,
					ticked_off_at: null,
					removed: false,
					seq,
					added_seq: seq
				});
			}
			return;
		}
		if (!item || item.removed) return;
		if (op.type === 'tick') Object.assign(item, { ticked_off: true, ticked_off_at: new Date().toISOString() });
		if (op.type === 'untick') Object.assign(item, { ticked_off: false, ticked_off_at: null });
		if (op.type === 'rename') item.text = op.text;
		if (op.type === 'remove') item.removed = true;
		item.seq = seq;
	}

	/** A change made somewhere else: the Hub or another phone. */
	elsewhere(type: Operation['type'], itemId: string, text?: string): void {
		this.apply({ id: crypto.randomUUID(), type, item_id: itemId, text } as Operation);
	}
}

function ids() {
	let n = 0;
	return () => `id-${++n}`;
}

const texts = (list: ShoppingList) => list.items.map((item) => (item.tickedOff ? `[x] ${item.text}` : item.text));

async function setUp(...start: string[]) {
	const backend = new FakeBackend();
	for (const text of start) backend.elsewhere('add', `start-${text}`, text);
	const onsignedout = vi.fn();
	const list = new ShoppingList(backend, { onsignedout, newId: ids() });
	await list.load();
	return { backend, list, onsignedout };
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

		expect(backend.sent.flat().map((op) => [op.type, op.item_id])).toEqual([
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

	it('asks to sign in again when the backend says 401', async () => {
		const { list, backend, onsignedout } = await setUp('Milk');
		backend.failing = new SignedOut();

		list.toggle('start-Milk');
		await settle();

		expect(onsignedout).toHaveBeenCalledOnce();
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
