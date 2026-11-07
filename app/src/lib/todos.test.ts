import { describe, expect, it } from 'vitest';
import { dueBy, groupTodos, lateness, type Todo } from './todos.ts';

const TODAY = '2026-11-07';
const todo = (text: string, due: string | null, tickedOff = false): Todo => ({ id: text, text, due, tickedOff });

describe('dueBy', () => {
	it('keeps To-dos due today or before, overdue first, leaving out later and undated ones', () => {
		const todos = [
			todo('Today', TODAY),
			todo('Next week', '2026-11-14'),
			todo('No date', null),
			todo('Last week', '2026-10-31'),
			todo('Yesterday', '2026-11-06')
		];
		expect(dueBy(todos, TODAY).map((t) => t.text)).toEqual(['Last week', 'Yesterday', 'Today']);
	});

	it('keeps a To-do just ticked off where it was, so it can be unticked', () => {
		const todos = [todo('Ticked', '2026-11-06', true), todo('Today', TODAY)];
		expect(dueBy(todos, TODAY).map((t) => t.text)).toEqual(['Ticked', 'Today']);
	});
});

describe('lateness', () => {
	it.each([
		[TODAY, 'Today'],
		['2026-11-06', '1 day late'],
		['2026-10-31', '7 days late'],
		['2026-11-08', 'Tomorrow']
	])('says a To-do due %s is “%s”', (due, said) => {
		expect(lateness(due, TODAY)).toBe(said);
	});

	it('counts whole days across the clocks going back', () => {
		expect(lateness('2026-10-24', '2026-10-26')).toBe('2 days late');
	});
});

describe('groupTodos', () => {
	it('groups To-dos as overdue, today, each later day, then undated', () => {
		const todos = [
			todo('Clean the oven', null),
			todo('Descale the kettle', '2026-11-12'),
			todo('Enter meter readings', TODAY),
			todo('Renew insurance', '2026-11-04'),
			todo('Book the MOT', '2026-11-12'),
			todo('Return library books', '2026-11-08')
		];
		expect(groupTodos(todos, TODAY)).toEqual([
			{ title: 'Overdue', todos: [todos[3]] },
			{ title: 'Today', todos: [todos[2]] },
			{ title: 'Tomorrow', todos: [todos[5]] },
			{ title: 'Thursday 12 November', todos: [todos[1], todos[4]] },
			{ title: 'No date', todos: [todos[0]] }
		]);
	});

	it('leaves out groups with nothing in them', () => {
		expect(groupTodos([todo('Clean the oven', null)], TODAY)).toEqual([
			{ title: 'No date', todos: [todo('Clean the oven', null)] }
		]);
	});
});
