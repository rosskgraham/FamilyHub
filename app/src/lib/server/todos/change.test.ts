import { describe, expect, it } from 'vitest';
import { parseTodoChange } from './change.ts';

describe('parseTodoChange', () => {
	it.each([
		[
			{ action: 'add', text: ' Book the MOT ', due: '2026-11-20' },
			{ action: 'add', text: 'Book the MOT', due: '2026-11-20' }
		],
		[
			{ action: 'add', text: 'Clean the oven', due: null },
			{ action: 'add', text: 'Clean the oven', due: null }
		],
		[
			{ action: 'tick', id: 't1', tickedOff: true },
			{ action: 'tick', id: 't1', tickedOff: true }
		]
	])('reads %j', (body, change) => {
		expect(parseTodoChange(body)).toEqual(change);
	});

	it('keeps an added To-do to 200 characters', () => {
		expect(parseTodoChange({ action: 'add', text: 'x'.repeat(300), due: null })).toMatchObject({
			text: 'x'.repeat(200)
		});
	});

	it.each([
		['nothing', null],
		['a blank To-do', { action: 'add', text: '  ', due: null }],
		['an add without a due date', { action: 'add', text: 'Clean the oven' }],
		['a due date that isn’t a day', { action: 'add', text: 'Clean the oven', due: 'tomorrow' }],
		['removing, which To-dos can’t be', { action: 'remove', id: 't1' }],
		['a tick without tickedOff', { action: 'tick', id: 't1' }]
	])('turns down %s', (_, body) => {
		expect(parseTodoChange(body)).toBeNull();
	});
});
