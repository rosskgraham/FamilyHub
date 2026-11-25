// For tests: the backend's Shopping list in memory, and ids made in order.
import {
	placeIn,
	type Changes,
	type ItemOperation,
	type ListApi,
	type Operation,
	type ServerItem,
	type ServerShop
} from './shopping.svelte.ts';

/** The backend's Shopping list in memory, merging as backend/familyhub_api/lists.py does. */
export class FakeBackend implements ListApi {
	items = new Map<string, ServerItem>();
	shops = new Map<string, ServerShop>();
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
		const shops = [...this.shops.values()].filter((shop) => shop.seq > after);
		return structuredClone({ items, shops, seq: this.seq });
	}

	apply(op: Operation): void {
		if (this.applied.has(op.id)) return;
		this.applied.add(op.id);
		const seq = ++this.seq;
		if (op.type === 'add_shop') {
			if (!this.shops.has(op.shop_id)) this.shops.set(op.shop_id, { id: op.shop_id, name: op.name, order: [], seq });
			return;
		}
		if (op.type === 'place') {
			const shop = this.shops.get(op.shop_id);
			const order = shop && placeIn(shop.order, op.name, op.after);
			if (shop && order!.join('\n') !== shop.order.join('\n')) Object.assign(shop, { order, seq });
			return;
		}
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
	elsewhere(type: ItemOperation['type'], itemId: string, text?: string): void {
		this.apply({ id: crypto.randomUUID(), type, item_id: itemId, text } as Operation);
	}
}

export function ids() {
	let n = 0;
	return () => `id-${++n}`;
}
