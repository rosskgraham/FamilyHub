import { describe, expect, it } from 'vitest';
import { toOperation, toShoppingItems, withOperations, type BackendItem } from './from-backend.ts';

const item = (id: string, added_seq: number, ticked_off = false, removed = false): BackendItem => ({
	id,
	text: id,
	ticked_off,
	ticked_off_at: ticked_off ? '2026-11-26T08:10:00Z' : null,
	removed,
	seq: added_seq,
	added_seq
});

describe('toShoppingItems', () => {
	it('lists items to get newest first, then items just ticked off, and leaves out removed ones', () => {
		expect(
			toShoppingItems([item('Bread', 3, true), item('Milk', 1), item('Gone', 5, false, true), item('Eggs', 2)])
		).toEqual([
			{ id: 'Eggs', text: 'Eggs', tickedOff: false },
			{ id: 'Milk', text: 'Milk', tickedOff: false },
			{ id: 'Bread', text: 'Bread', tickedOff: true }
		]);
	});
});

describe('toOperation', () => {
	const ids = () => {
		let n = 0;
		return () => `id-${++n}`;
	};

	it('gives an add its operation id and the new item’s id', () => {
		expect(toOperation({ action: 'add', text: 'Milk' }, ids())).toEqual({
			id: 'id-1',
			type: 'add',
			item_id: 'id-2',
			text: 'Milk'
		});
	});

	it('makes a tick, an untick or a remove of the item', () => {
		expect(toOperation({ action: 'tick', id: 'milk', tickedOff: true }, ids())).toEqual({
			id: 'id-1',
			type: 'tick',
			item_id: 'milk'
		});
		expect(toOperation({ action: 'tick', id: 'milk', tickedOff: false }, ids())).toMatchObject({ type: 'untick' });
		expect(toOperation({ action: 'remove', id: 'milk' }, ids())).toMatchObject({ type: 'remove', item_id: 'milk' });
	});

	it('makes new ids each time', () => {
		const a = toOperation({ action: 'add', text: 'Milk' });
		const b = toOperation({ action: 'add', text: 'Milk' });
		expect(new Set([a.id, a.item_id, b.id, b.item_id]).size).toBe(4);
	});
});

describe('withOperations', () => {
	it('shows the list as it will be once the operations are sent', () => {
		const items = [
			{ id: 'eggs', text: 'Eggs', tickedOff: false },
			{ id: 'milk', text: 'Milk', tickedOff: false }
		];
		expect(
			withOperations(items, [
				{ id: '1', type: 'add', item_id: 'bread', text: 'Bread' },
				{ id: '2', type: 'tick', item_id: 'eggs' },
				{ id: '3', type: 'remove', item_id: 'milk' },
				{ id: '4', type: 'tick', item_id: 'bread' },
				{ id: '5', type: 'untick', item_id: 'bread' }
			])
		).toEqual([
			{ id: 'bread', text: 'Bread', tickedOff: false },
			{ id: 'eggs', text: 'Eggs', tickedOff: true }
		]);
	});
});
