import { describe, expect, it } from 'vitest';
import { GoogleRefused } from '../google/auth.ts';
import { enqueue, send, withQueue, type QueuedChange } from './queue.ts';
import type { ShoppingSource } from './source.ts';

describe('enqueue', () => {
	it('gives an item added offline a made-up id', () => {
		expect(enqueue([], { action: 'add', text: 'Milk' }, 'queued-1')).toEqual([
			{ action: 'add', text: 'Milk', id: 'queued-1', tickedOff: false }
		]);
	});

	it('folds a tick or remove of an item added offline into its add', () => {
		const added = enqueue([], { action: 'add', text: 'Milk' }, 'queued-1');
		expect(enqueue(added, { action: 'tick', id: 'queued-1', tickedOff: true }, 'x')).toEqual([
			{ action: 'add', text: 'Milk', id: 'queued-1', tickedOff: true }
		]);
		expect(enqueue(added, { action: 'remove', id: 'queued-1' }, 'x')).toEqual([]);
	});

	it('keeps only the last tick of an item, and drops its ticks when it is removed', () => {
		let queue = enqueue([], { action: 'tick', id: 'eggs', tickedOff: true }, 'x');
		queue = enqueue(queue, { action: 'tick', id: 'eggs', tickedOff: false }, 'x');
		expect(queue).toEqual([{ action: 'tick', id: 'eggs', tickedOff: false }]);
		expect(enqueue(queue, { action: 'remove', id: 'eggs' }, 'x')).toEqual([{ action: 'remove', id: 'eggs' }]);
	});
});

describe('withQueue', () => {
	it('shows the list as it will be once the queue is sent', () => {
		const items = [
			{ id: 'eggs', text: 'Eggs', tickedOff: false },
			{ id: 'milk', text: 'Milk', tickedOff: false }
		];
		const queue: QueuedChange[] = [
			{ action: 'add', text: 'Bread', id: 'queued-1', tickedOff: false },
			{ action: 'tick', id: 'eggs', tickedOff: true },
			{ action: 'remove', id: 'milk' }
		];
		expect(withQueue(items, queue)).toEqual([
			{ id: 'queued-1', text: 'Bread', tickedOff: false },
			{ id: 'eggs', text: 'Eggs', tickedOff: true }
		]);
	});
});

// A Google Tasks list that records what it was asked, and fails as told.
function source(fail: (call: string) => Error | null = () => null) {
	const calls: string[] = [];
	const record = async (call: string) => {
		const problem = fail(call);
		if (problem) throw problem;
		calls.push(call);
	};
	const list: ShoppingSource = {
		list: async () => [],
		add: async (text) => (await record(`add ${text}`), `id-${text}`),
		setTickedOff: (id, tickedOff) => record(`tick ${id} ${tickedOff}`),
		remove: (id) => record(`remove ${id}`)
	};
	return { list, calls };
}

describe('send', () => {
	const queue: QueuedChange[] = [
		{ action: 'add', text: 'Bread', id: 'queued-1', tickedOff: true },
		{ action: 'tick', id: 'eggs', tickedOff: true },
		{ action: 'remove', id: 'milk' }
	];

	it('sends every change in order, giving an item added offline its real id', async () => {
		const google = source();
		expect(await send(queue, google.list)).toEqual([]);
		expect(google.calls).toEqual(['add Bread', 'tick id-Bread true', 'tick eggs true', 'remove milk']);
	});

	it('stops at the first change Google can’t be reached for, and keeps the rest', async () => {
		const google = source((call) => (call === 'tick eggs true' ? new TypeError('fetch failed') : null));
		expect(await send(queue, google.list)).toEqual(queue.slice(1));
		expect(google.calls).toEqual(['add Bread', 'tick id-Bread true']);
	});

	it('never adds an item twice when only its tick failed', async () => {
		const google = source((call) => (call === 'tick id-Bread true' ? new TypeError('fetch failed') : null));
		expect(await send(queue, google.list)).toEqual([{ action: 'tick', id: 'id-Bread', tickedOff: true }, ...queue.slice(1)]);
	});

	it('drops a change Google turns down, such as ticking off an item deleted on a phone', async () => {
		const google = source((call) => (call === 'tick eggs true' ? new GoogleRefused(404, 'gone') : null));
		expect(await send(queue, google.list)).toEqual([]);
		expect(google.calls).toEqual(['add Bread', 'tick id-Bread true', 'remove milk']);
	});
});
