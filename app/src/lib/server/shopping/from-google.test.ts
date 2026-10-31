import { describe, expect, it } from 'vitest';
import { toShoppingItems, type GoogleTask } from './from-google.ts';

const now = new Date('2026-10-28T08:15:00Z');
const toGet = (id: string, position: string, title = id): GoogleTask => ({ id, title, position, status: 'needsAction' });
const ticked = (id: string, completed: string): GoogleTask => ({ id, title: id, status: 'completed', completed, position: '0' });

describe('toShoppingItems', () => {
	it('lists items to get in the list’s order, then items just ticked off', () => {
		const items = toShoppingItems([ticked('Bread', '2026-10-28T08:10:00Z'), toGet('Eggs', '2'), toGet('Milk', '1')], now);
		expect(items).toEqual([
			{ id: 'Milk', text: 'Milk', tickedOff: false },
			{ id: 'Eggs', text: 'Eggs', tickedOff: false },
			{ id: 'Bread', text: 'Bread', tickedOff: true }
		]);
	});

	it('drops items ticked off 10 minutes ago or more, such as in the shop', () => {
		expect(toShoppingItems([ticked('Just', '2026-10-28T08:05:01Z')], now)).toHaveLength(1);
		expect(toShoppingItems([ticked('Bought', '2026-10-28T08:05:00Z')], now)).toEqual([]);
		expect(toShoppingItems([ticked('Yesterday', '2026-10-27T18:00:00Z')], now)).toEqual([]);
	});

	it('leaves out deleted tasks, subtasks and blank titles, and trims the rest', () => {
		const items = toShoppingItems(
			[
				{ ...toGet('gone', '1'), deleted: true },
				{ ...toGet('sub', '2'), parent: 'Milk' },
				toGet('blank', '3', '   '),
				toGet('cheese', '4', '  Cheddar ')
			],
			now
		);
		expect(items).toEqual([{ id: 'cheese', text: 'Cheddar', tickedOff: false }]);
	});
});
