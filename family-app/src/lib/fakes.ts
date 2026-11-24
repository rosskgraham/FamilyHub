// For tests: the backend's Shopping list in memory, and ids made in order.
import type { Changes, ListApi, Operation, ServerItem } from './shopping.svelte.ts';

/** The backend's Shopping list in memory, merging as backend/familyhub_api/lists.py does. */
export class FakeBackend implements ListApi {
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

export function ids() {
	let n = 0;
	return () => `id-${++n}`;
}
