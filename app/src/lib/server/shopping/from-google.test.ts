import { describe, expect, it } from 'vitest';
import { toShoppingItems, type GoogleTask } from './from-google.ts';

const today = '2026-10-28';
const toGet = (id: string, position: string, title = id): GoogleTask => ({ id, title, position, status: 'needsAction' });
const ticked = (id: string, completed: string): GoogleTask => ({ id, title: id, status: 'completed', completed, position: '0' });

describe('toShoppingItems', () => {
	it('lists items to get in the list’s order, then today’s ticked-off items', () => {
		const items = toShoppingItems([ticked('Bread', '2026-10-28T08:00:00Z'), toGet('Eggs', '2'), toGet('Milk', '1')], today);
		expect(items).toEqual([
			{ id: 'Milk', text: 'Milk', tickedOff: false },
			{ id: 'Eggs', text: 'Eggs', tickedOff: false },
			{ id: 'Bread', text: 'Bread', tickedOff: true }
		]);
	});

	it('drops items ticked off before today, by the UK day', () => {
		// 23:30 UTC on 27 October is still 27 October in the UK (GMT).
		const yesterday = ticked('Old', '2026-10-27T23:30:00Z');
		expect(toShoppingItems([yesterday], today)).toEqual([]);
	});

	it('leaves out deleted tasks, subtasks and blank titles, and trims the rest', () => {
		const items = toShoppingItems(
			[
				{ ...toGet('gone', '1'), deleted: true },
				{ ...toGet('sub', '2'), parent: 'Milk' },
				toGet('blank', '3', '   '),
				toGet('cheese', '4', '  Cheddar ')
			],
			today
		);
		expect(items).toEqual([{ id: 'cheese', text: 'Cheddar', tickedOff: false }]);
	});
});
