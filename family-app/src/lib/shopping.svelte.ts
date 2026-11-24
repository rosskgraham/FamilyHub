// The Shopping list on the phone (AB#57): the backend's items, with the phone's own changes shown on top straight
// away. Every change is an operation with ids made here, queued and sent in the background, and sent again until
// the backend has it, which is safe as the backend ignores one it already has. The backend decides how changes
// merge (design/family-app/notes.md, How sync works); the phone only replays its own unsent changes over what it
// last heard, so a tap never flicks back while it's on its way. Nothing is kept on the phone yet: closing the app
// with changes unsent loses them, until AB#58.

import { SvelteSet } from 'svelte/reactivity';

/** How long a ticked-off item stays on the list, as on the Hub and in the backend. */
export const TICKED_OFF_SHOWN_FOR = 10 * 60_000;
/** How long Undo shows after a remove. The remove is sent only once it's gone. */
export const UNDO_FOR = 5_000;
/** The longest an item's text can be, as the backend allows. */
export const MOST_TEXT = 200;
const MOST_OPERATIONS = 100;
// Sending again after a failure waits 1 second, then twice as long each time, up to a minute.
const RETRY_FIRST = 1_000;
const RETRY_MOST = 60_000;
// How often the list looks for ticked-off items whose 10 minutes are up.
const CLOCK_EVERY = 15_000;

/** An item as GET /lists/shopping/items gives it. */
export interface ServerItem {
	id: string;
	text: string;
	ticked_off: boolean;
	ticked_off_at: string | null;
	removed: boolean;
	seq: number;
	added_seq: number;
}

export interface Changes {
	items: ServerItem[];
	seq: number;
}

export type Operation =
	| { id: string; type: 'add' | 'rename'; item_id: string; text: string }
	| { id: string; type: 'tick' | 'untick' | 'remove'; item_id: string };

/** The backend's Shopping list. */
export interface ListApi {
	send(operations: Operation[]): Promise<void>;
	changes(after: number): Promise<Changes>;
}

/** The backend wants a fresh sign-in, or the token couldn't be renewed quietly. */
export class SignedOut extends Error {}

/** The backend refused a batch as invalid (a 422), so sending it again would never work. */
export class Rejected extends Error {}

/** An item as the list shows it. */
export interface Shown {
	id: string;
	text: string;
	tickedOff: boolean;
}

interface Known {
	id: string;
	text: string;
	tickedOff: boolean;
	tickedOffAt: number | null;
	/** Newest first. The phone's own unsent adds go above everything the backend has numbered. */
	order: number;
	/** The backend's number for its last change, so an answer that arrives late doesn't undo a newer one. */
	seq: number;
}

interface Pending {
	op: Operation;
	/** When it was made, for a tick's 10 minutes. */
	at: number;
}

export interface Options {
	/** Called when the backend wants a fresh sign-in. */
	onsignedout: () => void;
	newId?: () => string;
}

export function validText(text: string): string | null {
	const trimmed = text.trim();
	return trimmed && trimmed.length <= MOST_TEXT ? trimmed : null;
}

export class ShoppingList {
	#api: ListApi;
	#onsignedout: () => void;
	#newId: () => string;

	#known: Record<string, Known> = $state({});
	#queue: Pending[] = $state([]);
	#held: (Pending & { text: string; timer: ReturnType<typeof setTimeout> }) | null = $state(null);
	#now = $state(Date.now());
	// Removed for good, so an answer that arrives late can't bring an item back.
	#gone = new SvelteSet<string>();
	#seq = 0;
	#sending = false;
	#retryIn = RETRY_FIRST;
	#retryTimer: ReturnType<typeof setTimeout> | undefined;
	#clock: ReturnType<typeof setInterval> | undefined;

	/** Items to get, newest first, then those ticked off in the last 10 minutes. */
	readonly items: Shown[] = $derived.by(() => this.#view());
	readonly toGet: number = $derived(this.items.filter((item) => !item.tickedOff).length);
	/** The text of the item just removed, while its Undo shows. */
	readonly undoable: string | null = $derived(this.#held?.text ?? null);

	constructor(api: ListApi, options: Options) {
		this.#api = api;
		this.#onsignedout = options.onsignedout;
		this.#newId = options.newId ?? (() => crypto.randomUUID());
	}

	/** The whole list from the backend. Throws if it can't be reached, or SignedOut. */
	async load(): Promise<void> {
		const changes = await this.#api.changes(0);
		this.#known = {};
		this.#merge(changes);
		this.#clock ??= setInterval(() => (this.#now = Date.now()), CLOCK_EVERY);
	}

	/** Stops the list's timers. Anything unsent is lost. */
	stop(): void {
		clearInterval(this.#clock);
		clearTimeout(this.#retryTimer);
		if (this.#held) clearTimeout(this.#held.timer);
		this.#clock = undefined;
	}

	add(text: string): boolean {
		const valid = validText(text);
		if (!valid) return false;
		this.#queue.push({ op: { id: this.#newId(), type: 'add', item_id: this.#newId(), text: valid }, at: Date.now() });
		void this.flush();
		return true;
	}

	toggle(id: string): void {
		const item = this.items.find((shown) => shown.id === id);
		if (!item) return;
		this.#change(id, item.tickedOff ? 'untick' : 'tick');
	}

	/** Changes the item's text. Text that's unchanged, empty or too long sends nothing. */
	rename(id: string, text: string): boolean {
		const valid = validText(text);
		const item = this.items.find((shown) => shown.id === id);
		if (!valid || !item || valid === item.text) return false;
		this.#queue.push({ op: { id: this.#newId(), type: 'rename', item_id: id, text: valid }, at: Date.now() });
		void this.flush();
		return true;
	}

	/** Takes the item off straight away, and sends the remove once its Undo has gone. */
	remove(id: string): void {
		const item = this.items.find((shown) => shown.id === id);
		if (!item) return;
		this.#sendHeld();
		this.#held = {
			op: { id: this.#newId(), type: 'remove', item_id: id },
			at: Date.now(),
			text: item.text,
			timer: setTimeout(() => this.#sendHeld(), UNDO_FOR)
		};
	}

	/** Puts back the item just removed. Nothing was sent, so nothing needs undoing at the backend. */
	undo(): void {
		if (!this.#held) return;
		clearTimeout(this.#held.timer);
		this.#held = null;
	}

	/** The app's been put away: send a remove now rather than wait for its Undo, which may never come back. */
	hidden(): void {
		this.#sendHeld();
	}

	/** The app's back in front: send anything waiting, and catch up with changes made elsewhere. */
	async visible(): Promise<void> {
		this.#now = Date.now();
		await Promise.all([this.flush(), this.catchUp()]);
	}

	/** Sends what's waiting. A failure is tried again later; a 401 means signing in again. */
	async flush(): Promise<void> {
		if (this.#sending || this.#queue.length === 0) return;
		clearTimeout(this.#retryTimer);
		this.#sending = true;
		const batch = this.#queue.slice(0, MOST_OPERATIONS).map((pending) => pending.op);
		try {
			try {
				await this.#api.send(batch);
			} catch (error) {
				if (!(error instanceof Rejected)) throw error;
				// Never sent again, as it would never work. The catch-up below shows what the backend has.
			}
			this.#retryIn = RETRY_FIRST;
			// Catch up before dropping the sent changes, so the list goes straight from showing them to showing
			// the backend's answer, without a moment of neither.
			await this.catchUp();
			const sent = batch.map((op) => op.id);
			this.#queue = this.#queue.filter((pending) => !sent.includes(pending.op.id));
		} catch (error) {
			if (error instanceof SignedOut) {
				this.#onsignedout();
				return;
			}
			this.#retryTimer = setTimeout(() => void this.flush(), this.#retryIn);
			this.#retryIn = Math.min(this.#retryIn * 2, RETRY_MOST);
			return;
		} finally {
			this.#sending = false;
		}
		await this.flush();
	}

	/** Asks the backend what's changed since it last said. A failure waits for the next time. */
	async catchUp(): Promise<void> {
		try {
			this.#merge(await this.#api.changes(this.#seq));
		} catch (error) {
			if (error instanceof SignedOut) this.#onsignedout();
		}
	}

	#change(id: string, type: 'tick' | 'untick'): void {
		this.#queue.push({ op: { id: this.#newId(), type, item_id: id }, at: Date.now() });
		void this.flush();
	}

	#sendHeld(): void {
		if (!this.#held) return;
		const { op, at, timer } = this.#held;
		clearTimeout(timer);
		this.#held = null;
		this.#queue.push({ op, at });
		void this.flush();
	}

	#merge(changes: Changes): void {
		for (const item of changes.items) {
			const known = this.#known[item.id];
			if (item.removed || this.#gone.has(item.id)) {
				this.#gone.add(item.id);
				delete this.#known[item.id];
			} else if (!known || item.seq >= known.seq) {
				this.#known[item.id] = {
					id: item.id,
					text: item.text,
					tickedOff: item.ticked_off,
					tickedOffAt: item.ticked_off_at ? Date.parse(item.ticked_off_at) : null,
					order: item.added_seq,
					seq: item.seq
				};
			}
		}
		this.#seq = Math.max(this.#seq, changes.seq);
	}

	#view(): Shown[] {
		const items: Record<string, Known> = {};
		for (const [id, item] of Object.entries(this.#known)) items[id] = { ...item };
		const waiting = this.#held ? [...this.#queue, this.#held] : this.#queue;
		waiting.forEach(({ op, at }, index) => {
			const item = items[op.item_id];
			switch (op.type) {
				case 'add':
					if (!item && !this.#gone.has(op.item_id)) {
						items[op.item_id] = {
							id: op.item_id,
							text: op.text,
							tickedOff: false,
							tickedOffAt: null,
							order: Number.MAX_SAFE_INTEGER / 2 + index,
							seq: 0
						};
					}
					break;
				case 'tick':
					if (item) Object.assign(item, { tickedOff: true, tickedOffAt: at });
					break;
				case 'untick':
					if (item) Object.assign(item, { tickedOff: false, tickedOffAt: null });
					break;
				case 'rename':
					if (item) item.text = op.text;
					break;
				case 'remove':
					delete items[op.item_id];
					break;
			}
		});
		return Object.values(items)
			.filter((item) => !item.tickedOff || (item.tickedOffAt ?? 0) > this.#now - TICKED_OFF_SHOWN_FOR)
			.sort((a, b) => Number(a.tickedOff) - Number(b.tickedOff) || b.order - a.order)
			.map(({ id, text, tickedOff }) => ({ id, text, tickedOff }));
	}
}
