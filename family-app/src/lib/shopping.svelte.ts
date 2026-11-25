// The Shopping list on the phone (AB#57): the backend's items, with the phone's own changes shown on top straight
// away. Every change is an operation with ids made here, queued and sent in the background, and sent again until
// the backend has it, which is safe as the backend ignores one it already has. The backend decides how changes
// merge (design/family-app/notes.md, How sync works); the phone only replays its own unsent changes over what it
// last heard, so a tap never flicks back while it's on its way. Everything worth keeping is saved to the phone's
// copy as it changes (copy.ts, AB#58), so the list opens with no signal and closing the app loses nothing unsent.

import { SvelteSet } from 'svelte/reactivity';

/** How long a ticked-off item stays on the list, as on the Hub and in the backend. */
export const TICKED_OFF_SHOWN_FOR = 10 * 60_000;
/** How long Undo shows after a remove. The remove is sent only once it's gone. */
export const UNDO_FOR = 5_000;
/** The longest an item's text can be, as the backend allows. */
export const MOST_TEXT = 200;
/** The longest a Shop's name can be, as the backend allows. */
export const MOST_SHOP_NAME = 50;
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

/** A Shop as GET /lists/shopping/items gives it (#85): its walking order is matched item names, first to last. */
export interface ServerShop {
	id: string;
	name: string;
	order: string[];
	seq: number;
}

export interface Changes {
	items: ServerItem[];
	shops?: ServerShop[];
	seq: number;
}

export type ItemOperation =
	| { id: string; type: 'add' | 'rename'; item_id: string; text: string }
	| { id: string; type: 'tick' | 'untick' | 'remove'; item_id: string };

export type ShopOperation =
	| { id: string; type: 'add_shop'; shop_id: string; name: string }
	| { id: string; type: 'place'; shop_id: string; name: string; after: string | null };

export type Operation = ItemOperation | ShopOperation;

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
	/** A change to it hasn't reached the backend yet (screen F's "waiting"). */
	waiting: boolean;
	/** The picked Shop has learned where it goes (screen L). False with no Shop picked. */
	placed: boolean;
}

/** A Shop the list can be sorted for. */
export interface ShopChoice {
	id: string;
	name: string;
}

/**
 * Whether the backend can be reached: yes, no (screen F's banner), or only after signing in again (screen G's).
 * It's what the last try found.
 */
export type Reach = 'ok' | 'offline' | 'signed-out';

/** What the phone keeps of the list between openings (AB#58): what it last heard, and what it hasn't sent. */
export interface SavedList {
	seq: number;
	known: Record<string, Known>;
	queue: Pending[];
	gone: string[];
	/** The Shops the phone knows, and the one picked on this phone (AB#86). Copies saved before have neither. */
	shops?: Record<string, ServerShop>;
	shop?: string | null;
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
	/** Called after anything worth keeping changes, for the phone's copy to be saved. */
	onchange?: () => void;
	newId?: () => string;
}

export function validText(text: string, most = MOST_TEXT): string | null {
	const trimmed = text.trim();
	return trimmed && trimmed.length <= most ? trimmed : null;
}

const TRAILING_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/;

/**
 * The form item names are matched in, as the backend's match_name: lowercase, trimmed, runs of spaces collapsed,
 * trailing punctuation stripped, and no plural merging.
 */
export function matchName(text: string): string {
	return text.toLowerCase().split(/\s+/).filter(Boolean).join(' ').replace(TRAILING_PUNCTUATION, '').trimEnd();
}

/** A Shop's order after placing name straight after after, or at the start, as the backend does it. */
export function placeIn(order: string[], name: string, after: string | null): string[] {
	const matched = matchName(name);
	const follows = after === null ? null : matchName(after);
	if (!matched || matched === follows) return order;
	const rest = order.filter((known) => known !== matched);
	const at = follows !== null && rest.includes(follows) ? rest.indexOf(follows) + 1 : 0;
	return [...rest.slice(0, at), matched, ...rest.slice(at)];
}

export class ShoppingList {
	#api: ListApi;
	#onchange: () => void;
	#newId: () => string;

	#known: Record<string, Known> = $state({});
	#shops: Record<string, ServerShop> = $state({});
	#picked: string | null = $state(null);
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

	/** What the last try to reach the backend found. */
	reach: Reach = $state('ok');

	/** The Shops, with the phone's own unsent changes to them on top: each one's walking order, by id. */
	readonly #shopView: Record<string, ServerShop> = $derived.by(() => this.#viewShops());
	/** The Shops to pick from, by name. */
	readonly shops: ShopChoice[] = $derived(
		Object.values(this.#shopView)
			.map(({ id, name }) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	/** The Shop picked on this phone (screen K), or null for newest first. */
	readonly shop: ShopChoice | null = $derived(
		this.#picked && this.#shopView[this.#picked] ? { id: this.#picked, name: this.#shopView[this.#picked]!.name } : null
	);
	/**
	 * Items to get, then those ticked off in the last 10 minutes. With no Shop picked, newest first. With one,
	 * those it hasn't placed come first, newest first, then the rest in its walking order (screen L).
	 */
	readonly items: Shown[] = $derived.by(() => this.#view());
	readonly toGet: number = $derived(this.items.filter((item) => !item.tickedOff).length);
	/** The text of the item just removed, while its Undo shows. */
	readonly undoable: string | null = $derived(this.#held?.text ?? null);
	/** How many changes haven't reached the backend yet. */
	readonly waiting: number = $derived(this.#queue.length);

	constructor(api: ListApi, options: Options = {}) {
		this.#api = api;
		this.#onchange = options.onchange ?? (() => {});
		this.#newId = options.newId ?? (() => crypto.randomUUID());
	}

	/** The whole list from the backend. Throws if it can't be reached, or SignedOut. */
	async load(): Promise<void> {
		const changes = await this.#api.changes(0);
		this.#known = {};
		this.#shops = {};
		this.#merge(changes);
		this.#startClock();
	}

	/** Starts from the phone's copy, with no wait for the backend. refresh() then catches up and sends. */
	restore(saved: SavedList): void {
		this.#known = structuredClone(saved.known);
		this.#shops = structuredClone(saved.shops ?? {});
		this.#picked = saved.shop ?? null;
		this.#queue = structuredClone(saved.queue);
		this.#gone.clear();
		for (const id of saved.gone) this.#gone.add(id);
		this.#seq = saved.seq;
		this.#startClock();
	}

	/** What to keep on the phone. A remove waiting for its Undo isn't in it: it's sent when the app's put away. */
	snapshot(): SavedList {
		return {
			seq: this.#seq,
			known: $state.snapshot(this.#known),
			queue: $state.snapshot(this.#queue),
			gone: [...this.#gone],
			shops: $state.snapshot(this.#shops),
			shop: this.#picked
		};
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
		this.#push({ id: this.#newId(), type: 'add', item_id: this.#newId(), text: valid });
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
		this.#push({ id: this.#newId(), type: 'rename', item_id: id, text: valid });
		return true;
	}

	/** Sorts the list for a Shop, or newest first with null. Kept on this phone only. */
	pick(shopId: string | null): void {
		this.#picked = shopId;
		this.#onchange();
	}

	/** Adds a Shop for the Household, and picks it on this phone (screen N). */
	addShop(name: string): boolean {
		const valid = validText(name, MOST_SHOP_NAME);
		if (!valid) return false;
		const shopId = this.#newId();
		this.#picked = shopId;
		this.#push({ id: this.#newId(), type: 'add_shop', shop_id: shopId, name: valid });
		return true;
	}

	/**
	 * An item to get has been dragged to position to among the items to get (screen M). Teaches the picked Shop
	 * that it goes straight after the nearest item above it there that the Shop knows, or at the start.
	 */
	place(id: string, to: number): void {
		const shop = this.shop && this.#shopView[this.shop.id];
		const toGet = this.items.filter((item) => !item.tickedOff);
		const moved = toGet.find((item) => item.id === id);
		if (!shop || !moved) return;
		const rest = toGet.filter((item) => item !== moved);
		const self = matchName(moved.text);
		const known = (item: Shown) => matchName(item.text) !== self && shop.order.includes(matchName(item.text));
		const above = rest.slice(0, Math.max(0, Math.min(to, rest.length))).findLast(known);
		const after = above ? above.text : null;
		if (placeIn(shop.order, moved.text, after).join('\n') === shop.order.join('\n')) return;
		this.#push({ id: this.#newId(), type: 'place', shop_id: shop.id, name: moved.text, after });
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
		await this.refresh();
	}

	/** Sends anything waiting and catches up, as when the app opens from the phone's copy. */
	async refresh(): Promise<void> {
		await Promise.all([this.flush(), this.catchUp()]);
	}

	/** Signing in again is needed (screen G). The list stays usable, and changes are kept until then. */
	signedOut(): void {
		clearTimeout(this.#retryTimer);
		this.reach = 'signed-out';
	}

	/**
	 * Sends what's waiting. A failure is tried again later, with what's waiting kept; a 401 means signing in
	 * again first.
	 */
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
			this.#reached();
			// Catch up before dropping the sent changes, so the list goes straight from showing them to showing
			// the backend's answer, without a moment of neither.
			await this.catchUp();
			const sent = batch.map((op) => op.id);
			this.#queue = this.#queue.filter((pending) => !sent.includes(pending.op.id));
			this.#onchange();
		} catch (error) {
			this.#failed(error);
			return;
		} finally {
			this.#sending = false;
		}
		await this.flush();
	}

	/** A live update says the list changed up to seq (AB#59). Catches up only if that's past what the list has. */
	async heard(seq: number): Promise<void> {
		if (seq > this.#seq) await this.catchUp();
	}

	/** Asks the backend what's changed since it last said. A failure is tried again later. */
	async catchUp(): Promise<void> {
		try {
			this.#merge(await this.#api.changes(this.#seq));
			this.#reached();
			this.#onchange();
		} catch (error) {
			this.#failed(error);
		}
	}

	#reached(): void {
		this.#retryIn = RETRY_FIRST;
		if (this.reach === 'offline') this.reach = 'ok';
	}

	#failed(error: unknown): void {
		if (error instanceof SignedOut) {
			this.signedOut();
			return;
		}
		if (this.reach === 'signed-out') return;
		this.reach = 'offline';
		clearTimeout(this.#retryTimer);
		this.#retryTimer = setTimeout(() => void this.refresh(), this.#retryIn);
		this.#retryIn = Math.min(this.#retryIn * 2, RETRY_MOST);
	}

	#startClock(): void {
		this.#clock ??= setInterval(() => (this.#now = Date.now()), CLOCK_EVERY);
	}

	#push(op: Operation, at = Date.now()): void {
		this.#queue.push({ op, at });
		this.#onchange();
		void this.flush();
	}

	#change(id: string, type: 'tick' | 'untick'): void {
		this.#push({ id: this.#newId(), type, item_id: id });
	}

	#sendHeld(): void {
		if (!this.#held) return;
		const { op, at, timer } = this.#held;
		clearTimeout(timer);
		this.#held = null;
		this.#push(op, at);
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
		for (const shop of changes.shops ?? []) {
			const known = this.#shops[shop.id];
			if (!known || shop.seq >= known.seq) this.#shops[shop.id] = shop;
		}
		this.#seq = Math.max(this.#seq, changes.seq);
	}

	#viewShops(): Record<string, ServerShop> {
		const shops: Record<string, ServerShop> = {};
		for (const [id, shop] of Object.entries(this.#shops)) shops[id] = { ...shop, order: [...shop.order] };
		for (const { op } of this.#queue) {
			if (op.type === 'add_shop') {
				shops[op.shop_id] ??= { id: op.shop_id, name: op.name, order: [], seq: 0 };
			} else if (op.type === 'place') {
				const shop = shops[op.shop_id];
				if (shop) shop.order = placeIn(shop.order, op.name, op.after);
			}
		}
		return shops;
	}

	#view(): Shown[] {
		const items: Record<string, Known> = {};
		for (const [id, item] of Object.entries(this.#known)) items[id] = { ...item };
		const waiting = this.#held ? [...this.#queue, this.#held] : this.#queue;
		waiting.forEach(({ op, at }, index) => {
			if (op.type === 'add_shop' || op.type === 'place') return;
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
		const unsent = this.#queue.map(({ op }) => ('item_id' in op ? op.item_id : null));
		// Where the picked Shop has each item, by its matched name; -1 for one it hasn't placed.
		const walking = this.shop ? this.#shopView[this.shop.id]!.order : null;
		const at = (item: Known) => (walking ? walking.indexOf(matchName(item.text)) : -1);
		return Object.values(items)
			.filter((item) => !item.tickedOff || (item.tickedOffAt ?? 0) > this.#now - TICKED_OFF_SHOWN_FOR)
			.map((item) => ({ item, at: item.tickedOff ? -1 : at(item) }))
			.sort(
				(a, b) =>
					Number(a.item.tickedOff) - Number(b.item.tickedOff) ||
					Number(a.at >= 0) - Number(b.at >= 0) ||
					a.at - b.at ||
					b.item.order - a.item.order
			)
			.map(({ item: { id, text, tickedOff }, at }) => ({
				id,
				text,
				tickedOff,
				waiting: unsent.includes(id),
				placed: at >= 0
			}));
	}
}
