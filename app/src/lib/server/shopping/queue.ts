// Shopping list changes made while Google can't be reached wait here, on the Hub's
// disk, and are sent in order once it can. The list on screen shows them straight away.
import type { ShoppingChange, ShoppingItem } from '#lib/shopping.ts';
import { GoogleRefused, SignInNeeded } from '../google/auth.ts';
import { readJson, writeJson } from '../store.ts';
import type { ShoppingSource } from './source.ts';

/** An item added while offline has a made-up id until Google gives it a real one. */
export type QueuedChange =
	| { action: 'add'; text: string; id: string; tickedOff: boolean }
	| { action: 'tick'; id: string; tickedOff: boolean }
	| { action: 'remove'; id: string };

/** Ids of items added while offline start with this, so changes to them stay in the queue. */
export const QUEUED_ID = 'queued-';

/** The queue with one more change: a change to an item added while offline updates or cancels the add. */
export function enqueue(queue: QueuedChange[], change: ShoppingChange, newId: string): QueuedChange[] {
	if (change.action === 'add') return [...queue, { action: 'add', text: change.text, id: newId, tickedOff: false }];
	if (change.id.startsWith(QUEUED_ID)) {
		if (change.action === 'remove') return queue.filter((c) => c.id !== change.id);
		return queue.map((c) => (c.action === 'add' && c.id === change.id ? { ...c, tickedOff: change.tickedOff } : c));
	}
	// Only the last tick or untick of an item matters, and removing it makes them all moot.
	const others = queue.filter((c) => !(c.action === 'tick' && c.id === change.id));
	return [...others, change.action === 'tick' ? { ...change } : { action: 'remove', id: change.id }];
}

/** The list as it will be once the queue is sent. */
export function withQueue(items: ShoppingItem[], queue: QueuedChange[]): ShoppingItem[] {
	let result = items;
	for (const c of queue) {
		if (c.action === 'add') result = [{ id: c.id, text: c.text, tickedOff: c.tickedOff }, ...result];
		else if (c.action === 'tick') result = result.map((i) => (i.id === c.id ? { ...i, tickedOff: c.tickedOff } : i));
		else result = result.filter((i) => i.id !== c.id);
	}
	return result;
}

/**
 * Sends the queue in order and resolves to what's left: nothing, or everything from the first change
 * Google couldn't take. A change Google turns down, such as ticking off an item someone has since
 * deleted on their phone, is dropped rather than retried forever.
 */
export async function send(queue: QueuedChange[], source: ShoppingSource): Promise<QueuedChange[]> {
	for (const [i, c] of queue.entries()) {
		// Once Google has an added item, what's left of the change is ticking it off.
		let added: string | null = null;
		try {
			if (c.action === 'add') {
				added = await source.add(c.text);
				if (c.tickedOff) await source.setTickedOff(added, true);
			} else if (c.action === 'tick') {
				await source.setTickedOff(c.id, c.tickedOff);
			} else {
				await source.remove(c.id);
			}
		} catch (e) {
			if (e instanceof GoogleRefused) {
				console.error('Shopping list change dropped:', e);
				continue;
			}
			if (!(e instanceof SignInNeeded)) console.error('Shopping list still offline:', e);
			const rest = queue.slice(i + 1);
			return added === null ? [c, ...rest] : [{ action: 'tick', id: added, tickedOff: true }, ...rest];
		}
	}
	return [];
}

const QUEUE_FILE = 'shopping-queue.json';

// One change to the queue at a time, so a change made while it's being sent isn't lost.
let busy: Promise<unknown> = Promise.resolve();
function serially<T>(task: () => Promise<T>): Promise<T> {
	const result = busy.then(task);
	busy = result.catch(() => undefined);
	return result;
}

export function readQueue(): Promise<QueuedChange[]> {
	return serially(async () => (await readJson<QueuedChange[]>(QUEUE_FILE)) ?? []);
}

export function addToQueue(change: ShoppingChange): Promise<void> {
	return serially(async () => {
		const queue = (await readJson<QueuedChange[]>(QUEUE_FILE)) ?? [];
		await writeJson(QUEUE_FILE, enqueue(queue, change, `${QUEUED_ID}${Date.now()}`));
	});
}

/** Sends whatever is waiting, and resolves to what's still waiting. */
export function sendQueue(source: ShoppingSource): Promise<QueuedChange[]> {
	return serially(async () => {
		const queue = (await readJson<QueuedChange[]>(QUEUE_FILE)) ?? [];
		if (queue.length === 0) return queue;
		const left = await send(queue, source);
		await writeJson(QUEUE_FILE, left);
		return left;
	});
}
