// Changes to a Google Tasks list made while Google can't be reached wait here, on the Hub's
// disk, and are sent in order once it can. The list on screen shows them straight away.
// The Shopping list and To-dos each have a queue of their own.
import type { Addition, Change, Item } from '#lib/task-list.ts';
import { GoogleRefused, SignInNeeded } from '../google/auth.ts';
import { readJson, writeJson } from '../store.ts';

/** An item added while offline has a made-up id until Google gives it a real one. */
export type QueuedChange<A extends Addition> =
	| ({ action: 'add'; id: string; tickedOff: boolean } & A)
	| { action: 'tick'; id: string; tickedOff: boolean }
	| { action: 'remove'; id: string };

/** The changes a Google Tasks list can be sent. */
export interface ChangeTarget<A extends Addition> {
	/** Resolves to the new item's id. */
	add(addition: A): Promise<string>;
	setTickedOff(id: string, tickedOff: boolean): Promise<void>;
	remove(id: string): Promise<void>;
}

/** Ids of items added while offline start with this, so changes to them stay in the queue. */
export const QUEUED_ID = 'queued-';

/**
 * The queue with one more change. A change to an item added while offline updates or cancels the add, or, once the add
 * has been sent, goes to the id Google gave the item: `sent` maps made-up ids to real ones. The screen shows the made-up
 * id until it next reloads, so a tick or remove can still come with it.
 */
export function enqueue<A extends Addition>(
	queue: QueuedChange<A>[],
	change: Change<A>,
	newId: string,
	sent: Record<string, string> = {}
): QueuedChange<A>[] {
	if (change.action === 'add') return [...queue, { ...change, id: newId, tickedOff: false }];
	if (change.id in sent) change = { ...change, id: sent[change.id]! };
	if (change.id.startsWith(QUEUED_ID)) {
		if (change.action === 'remove') return queue.filter((c) => c.id !== change.id);
		return queue.map((c) => (c.action === 'add' && c.id === change.id ? { ...c, tickedOff: change.tickedOff } : c));
	}
	// Only the last tick or untick of an item matters, and removing it makes them all moot.
	const others = queue.filter((c) => !(c.action === 'tick' && c.id === change.id));
	return [...others, change.action === 'tick' ? { ...change } : { action: 'remove', id: change.id }];
}

/** The list as it will be once the queue is sent. */
export function withQueue<A extends Addition>(items: Item<A>[], queue: QueuedChange<A>[]): Item<A>[] {
	let result = items;
	for (const c of queue) {
		if (c.action === 'add') {
			const { action: _, ...added } = c;
			result = [added as unknown as Item<A>, ...result];
		} else if (c.action === 'tick') result = result.map((i) => (i.id === c.id ? { ...i, tickedOff: c.tickedOff } : i));
		else result = result.filter((i) => i.id !== c.id);
	}
	return result;
}

/**
 * Sends the queue in order and resolves to what's left: nothing, or everything from the first change
 * Google couldn't take. A change Google turns down, such as ticking off an item someone has since
 * deleted on their phone, is dropped rather than retried forever.
 */
export async function send<A extends Addition>(
	queue: QueuedChange<A>[],
	target: ChangeTarget<A>,
	name = 'Google Tasks list',
	/** Told the id Google gives each item added offline. */
	onAdded: (queuedId: string, id: string) => void = () => {}
): Promise<QueuedChange<A>[]> {
	for (const [i, c] of queue.entries()) {
		// Once Google has an added item, what's left of the change is ticking it off.
		let added: string | null = null;
		try {
			if (c.action === 'add') {
				const { action: _, id: __, tickedOff, ...addition } = c;
				added = await target.add(addition as unknown as A);
				onAdded(c.id, added);
				if (tickedOff) await target.setTickedOff(added, true);
			} else if (c.action === 'tick') {
				await target.setTickedOff(c.id, c.tickedOff);
			} else {
				await target.remove(c.id);
			}
		} catch (e) {
			if (e instanceof GoogleRefused) {
				console.error(`${name} change dropped:`, e);
				continue;
			}
			if (!(e instanceof SignInNeeded)) console.error(`${name} still offline:`, e);
			const rest = queue.slice(i + 1);
			return added === null ? [c, ...rest] : [{ action: 'tick', id: added, tickedOff: true }, ...rest];
		}
	}
	return [];
}

export interface Queue<A extends Addition> {
	read(): Promise<QueuedChange<A>[]>;
	add(change: Change<A>): Promise<void>;
	/** Sends whatever is waiting, and resolves to what's still waiting. */
	send(target: ChangeTarget<A>): Promise<QueuedChange<A>[]>;
}

// How many made-up ids to remember the real ids of. Only the latest matter: the screen reloads within a minute.
const SENT_KEPT = 50;

/** A queue kept in a file of its own in the Hub's data folder, or in `dir` for tests. */
export function createQueue<A extends Addition>(file: string, name: string, dir?: string): Queue<A> {
	// One change to the queue at a time, so a change made while it's being sent isn't lost.
	let busy: Promise<unknown> = Promise.resolve();
	function serially<T>(task: () => Promise<T>): Promise<T> {
		const result = busy.then(task);
		busy = result.catch(() => undefined);
		return result;
	}
	const load = async () => (await readJson<QueuedChange<A>[]>(file, dir)) ?? [];
	// Which real id each item added offline was given, beside the queue, such as shopping-queue-sent.json.
	const sentFile = file.replace(/.json$/, '-sent.json');
	const loadSent = async () => (await readJson<Record<string, string>>(sentFile, dir)) ?? {};

	return {
		read: () => serially(load),
		add: (change) =>
			serially(async () => {
				await writeJson(file, enqueue(await load(), change, `${QUEUED_ID}${Date.now()}`, await loadSent()), dir);
			}),
		send: (target) =>
			serially(async () => {
				const queue = await load();
				if (queue.length === 0) return queue;
				const sent = await loadSent();
				const left = await send(queue, target, name, (queuedId, id) => (sent[queuedId] = id));
				await writeJson(file, left, dir);
				await writeJson(sentFile, Object.fromEntries(Object.entries(sent).slice(-SENT_KEPT)), dir);
				return left;
			})
	};
}
