// The phone's copy of the Shopping list (AB#58), so the app opens and works with no signal, as in a shop, and
// closing it loses nothing unsent. Kept in IndexedDB, in the browser's storage for the app's own address. It
// belongs to one account: the app starts afresh when a different one signs in, and Sign out clears it.
import type { SavedList } from './shopping.svelte.ts';

/** The copy, with who it belongs to. */
export interface Copy {
	/** MSAL's id for the account that signed in. */
	account: string;
	firstName: string;
	initial: string;
	list: SavedList;
}

export interface CopyStore {
	read(): Promise<Copy | null>;
	write(copy: Copy): Promise<void>;
	clear(): Promise<void>;
}

const DATABASE = 'familyhub';
const STORE = 'copy';
const KEY = 'shopping';

function opened(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function done<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** The copy in IndexedDB. Writes are made in order, so the last one written is the one read next time. */
export function indexedDbCopy(): CopyStore {
	let database: Promise<IDBDatabase> | null = null;
	const store = async (mode: IDBTransactionMode) =>
		(await (database ??= opened())).transaction(STORE, mode).objectStore(STORE);

	return {
		async read() {
			return ((await done((await store('readonly')).get(KEY))) as Copy | undefined) ?? null;
		},
		async write(copy) {
			await done((await store('readwrite')).put(copy, KEY));
		},
		async clear() {
			await done((await store('readwrite')).delete(KEY));
		}
	};
}

/** A copy kept in memory, for tests. */
export function memoryCopy(initial: Copy | null = null): CopyStore & { saved: Copy | null } {
	return {
		saved: initial ? structuredClone(initial) : null,
		async read() {
			return this.saved ? structuredClone(this.saved) : null;
		},
		async write(copy) {
			this.saved = structuredClone(copy);
		},
		async clear() {
			this.saved = null;
		}
	};
}
