import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GoogleRefused } from '../google/auth.ts';
import { googleError } from '../google/errors.ts';
import { createQueue, enqueue, send, withQueue, type ChangeTarget, type QueuedChange } from './queue.ts';

// The queue is shared; these tests use a Shopping list's changes, whose adds carry just the text.
type Shopping = { text: string };

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
	it('carries everything an add has, such as a To-do’s due date, onto the item it shows', () => {
		const queue: QueuedChange<{ text: string; due: string | null }>[] = [
			{ action: 'add', text: 'Enter meter readings', due: '2026-12-01', id: 'queued-1', tickedOff: false }
		];
		expect(withQueue([], queue)).toEqual([
			{ id: 'queued-1', text: 'Enter meter readings', due: '2026-12-01', tickedOff: false }
		]);
	});

	it('shows the list as it will be once the queue is sent', () => {
		const items = [
			{ id: 'eggs', text: 'Eggs', tickedOff: false },
			{ id: 'milk', text: 'Milk', tickedOff: false }
		];
		const queue: QueuedChange<Shopping>[] = [
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
	const list: ChangeTarget<Shopping> = {
		add: async ({ text }) => (await record(`add ${text}`), `id-${text}`),
		setTickedOff: (id, tickedOff) => record(`tick ${id} ${tickedOff}`),
		remove: (id) => record(`remove ${id}`)
	};
	return { list, calls };
}

describe('send', () => {
	const queue: QueuedChange<Shopping>[] = [
		{ action: 'add', text: 'Bread', id: 'queued-1', tickedOff: true },
		{ action: 'tick', id: 'eggs', tickedOff: true },
		{ action: 'remove', id: 'milk' }
	];

	it('sends every change in order, giving an item added offline its real id', async () => {
		const google = source();
		expect(await send(queue, google.list)).toEqual([]);
		expect(google.calls).toEqual(['add Bread', 'tick id-Bread true', 'tick eggs true', 'remove milk']);
	});

	it('sends everything an add has, such as a To-do’s due date', async () => {
		const added: unknown[] = [];
		const target: ChangeTarget<{ text: string; due: string | null }> = {
			add: async (addition) => (added.push(addition), 'id-1'),
			setTickedOff: async () => {},
			remove: async () => {}
		};
		const todo = {
			action: 'add',
			text: 'Enter meter readings',
			due: '2026-12-01',
			id: 'queued-1',
			tickedOff: false
		} as const;
		expect(await send([todo], target)).toEqual([]);
		expect(added).toEqual([{ text: 'Enter meter readings', due: '2026-12-01' }]);
	});

	it('stops at the first change Google can’t be reached for, and keeps the rest', async () => {
		const google = source((call) => (call === 'tick eggs true' ? new TypeError('fetch failed') : null));
		expect(await send(queue, google.list)).toEqual(queue.slice(1));
		expect(google.calls).toEqual(['add Bread', 'tick id-Bread true']);
	});

	it('never adds an item twice when only its tick failed', async () => {
		const google = source((call) => (call === 'tick id-Bread true' ? new TypeError('fetch failed') : null));
		expect(await send(queue, google.list)).toEqual([
			{ action: 'tick', id: 'id-Bread', tickedOff: true },
			...queue.slice(1)
		]);
	});

	it('drops a change Google turns down, such as ticking off an item deleted on a phone', async () => {
		const google = source((call) => (call === 'tick eggs true' ? new GoogleRefused(404, 'gone') : null));
		expect(await send(queue, google.list)).toEqual([]);
		expect(google.calls).toEqual(['add Bread', 'tick id-Bread true', 'remove milk']);
	});

	it.each([
		[
			'to slow down, which it sends as a 403',
			googleError(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 'failed')
		],
		['for a fresh sign-in', googleError(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }, 'failed')]
	])('keeps a change when Google asks %s', async (_, error) => {
		const google = source((call) => (call === 'tick eggs true' ? error : null));
		expect(await send(queue, google.list)).toEqual(queue.slice(1));
	});
});

describe('an item added offline, after its add has been sent', () => {
	it('sends a later tick or remove to the id Google gave it', () => {
		const sent = { 'queued-1': 'id-Bread' };
		expect(enqueue<Shopping>([], { action: 'remove', id: 'queued-1' }, 'x', sent)).toEqual([
			{ action: 'remove', id: 'id-Bread' }
		]);
		expect(enqueue<Shopping>([], { action: 'tick', id: 'queued-1', tickedOff: true }, 'x', sent)).toEqual([
			{ action: 'tick', id: 'id-Bread', tickedOff: true }
		]);
	});

	it('tells whoever asked which id Google gave each item added offline', async () => {
		const google = source();
		const added: [string, string][] = [];
		await send(
			[{ action: 'add', text: 'Bread', id: 'queued-1', tickedOff: false }],
			google.list,
			'Shopping list',
			(queuedId, id) => added.push([queuedId, id])
		);
		expect(added).toEqual([['queued-1', 'id-Bread']]);
	});

	// The queue keeps its file in a folder of the test's own, never the Hub's data folder.
	let dir: string | undefined;
	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it('removes it from Google when the remove comes after the add was sent', async () => {
		dir = await mkdtemp(join(tmpdir(), 'familyhub-queue-'));
		const queue = createQueue<Shopping>('queue.json', 'Shopping list', dir);
		const google = source();
		await queue.add({ action: 'add', text: 'Bread' });
		const queuedId = (await queue.read())[0]!.id;
		await queue.send(google.list);
		// The screen still shows the item by its made-up id until it reloads.
		await queue.add({ action: 'remove', id: queuedId });
		expect(await queue.send(google.list)).toEqual([]);
		expect(google.calls).toEqual(['add Bread', 'remove id-Bread']);
	});
});
