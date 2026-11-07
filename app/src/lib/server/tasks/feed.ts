// A Google Tasks list as the Hub shows it: kept fresh in the background, shown from disk when Google can't be reached,
// and changed at once or queued until Google can be. The Shopping list and To-dos are each one of these.
import { CALENDAR_SOURCE } from '$app/env/private';
import type { Addition, Change, Item, ListStatus } from '#lib/task-list.ts';
import { GoogleRefused, isConfigured, isSignedIn, SignInNeeded } from '../google/auth.ts';
import { orElse } from '../fallback.ts';
import { readSettings, type Settings } from '../settings.ts';
import { readJson, writeJson } from '../store.ts';
import { createSync, type Kept, type Sync } from '../sync.ts';
import { createQueue, QUEUED_ID, withQueue, type ChangeTarget } from './queue.ts';

export interface ListSource<A extends Addition, I extends Item<A>> extends ChangeTarget<A> {
	list(): Promise<I[]>;
}

export interface ListResult<I> {
	items: I[];
	status: ListStatus;
}

export interface FeedOptions<A extends Addition, I extends Item<A>> {
	/** For logs and the sync's own messages, such as "Shopping list". */
	name: string;
	/** Which Google Tasks list it is, as chosen on the setup page. */
	listId: (settings: Settings) => string | undefined;
	/** Shown before the Hub is set up, and whenever CALENDAR_SOURCE=sample. */
	sample: ListSource<A, I>;
	google: (listId: string) => ListSource<A, I>;
	/** Files in the Hub's data folder: the last good list, and changes waiting to be sent. */
	cacheFile: string;
	queueFile: string;
}

export interface Feed<A extends Addition, I extends Item<A>> {
	/** The list, or a stale or empty one with a status saying why. */
	load(): Promise<ListResult<I>>;
	/** Makes a change, or queues it while Google can't be reached. Resolves to 200, or 202 if it's queued. */
	apply(change: Change<A>): Promise<200 | 202>;
}

// Changes at the Hub refresh a list straight away; this is for changes made on phones.
const REFRESH_MS = 60_000;

export function createFeed<A extends Addition, I extends Item<A>>(options: FeedOptions<A, I>): Feed<A, I> {
	const queue = createQueue<A>(options.queueFile, options.name);
	let sync: { listId: string; list: Sync<I[]> } | undefined;

	/** The background sync for one Google Tasks list, started again if a different list is chosen. */
	function listSync(listId: string, source: ListSource<A, I>): Sync<I[]> {
		if (sync?.listId !== listId) {
			const list = createSync({
				name: options.name,
				fetch: async () => {
					// Changes made while offline go first, so the list Google sends back includes them.
					await queue.send(source);
					return source.list();
				},
				everyMs: REFRESH_MS,
				load: async () => {
					const cached = await readJson<{ items: I[]; at: string }>(options.cacheFile);
					return cached && { value: cached.items, at: cached.at };
				},
				save: (k: Kept<I[]>) => writeJson(options.cacheFile, { items: k.value, at: k.at })
			});
			sync = { listId, list };
		}
		return sync.list;
	}

	/** The Google Tasks list once the Hub is signed in and a list is chosen, otherwise the sample one. */
	async function current(): Promise<
		| { live: false; setUp: boolean; source: ListSource<A, I> }
		| { live: true; source: ListSource<A, I>; sync: Sync<I[]> }
	> {
		const listId = options.listId(await readSettings());
		const setUp = isConfigured() && listId !== undefined && (await isSignedIn());
		if (CALENDAR_SOURCE === 'sample' || !setUp) return { live: false, setUp, source: options.sample };
		const source = options.google(listId!);
		return { live: true, source, sync: listSync(listId!, source) };
	}

	async function loadList(): Promise<ListResult<I>> {
		const list = await current();
		if (!list.live) return { items: await list.source.list(), status: { kind: 'sample', setUp: list.setUp } };
		const [{ value, at, error }, waiting] = await Promise.all([list.sync.read(), queue.read()]);
		const items = withQueue(value ?? [], waiting) as I[];
		if (error) {
			const reason = error instanceof SignInNeeded ? 'sign-in' : 'offline';
			return { items, status: { kind: 'stale', reason, updatedAt: at, waiting: waiting.length } };
		}
		if (waiting.length > 0)
			return { items, status: { kind: 'stale', reason: 'offline', updatedAt: at, waiting: waiting.length } };
		return { items, status: { kind: 'live', updatedAt: at! } };
	}

	return {
		load: () =>
			orElse(options.name, loadList, {
				items: [],
				status: { kind: 'stale', reason: 'offline', updatedAt: null, waiting: 0 }
			}),

		async apply(change) {
			const list = await current();
			// Behind earlier changes still waiting, so they reach Google in the order they were made.
			if (
				list.live &&
				((change.action !== 'add' && change.id.startsWith(QUEUED_ID)) || (await queue.read()).length > 0)
			) {
				await queue.add(change);
				const waiting = await queue.send(list.source);
				// So the page the screen loads next shows the change.
				if (waiting.length === 0) await list.sync.refresh();
				return waiting.length > 0 ? 202 : 200;
			}
			try {
				if (change.action === 'add') {
					const { action: _, ...addition } = change;
					await list.source.add(addition as unknown as A);
				} else if (change.action === 'tick') await list.source.setTickedOff(change.id, change.tickedOff);
				else await list.source.remove(change.id);
			} catch (e) {
				// The screen says so: Google needs signing in again, or turned this change down.
				if (e instanceof SignInNeeded || e instanceof GoogleRefused || !list.live) throw e;
				console.error(`${options.name} change queued:`, e);
				await queue.add(change);
				return 202;
			}
			if (list.live) await list.sync.refresh();
			return 200;
		}
	};
}
