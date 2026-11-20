import { describe, expect, it } from 'vitest';
import { backspace, insert, layers, startsSentence } from './keyboard.ts';

describe('insert', () => {
	it('types at the caret', () => {
		expect(insert('Mlk', 1, 1, 'i')).toEqual({ value: 'Milk', caret: 2 });
	});

	it('types over a selection', () => {
		expect(insert('Milk', 0, 4, 'Eggs')).toEqual({ value: 'Eggs', caret: 4 });
	});

	it('stops at the box’s maximum length', () => {
		expect(insert('abc', 3, 3, 'de', 4)).toEqual({ value: 'abcd', caret: 4 });
		expect(insert('abcd', 4, 4, 'e', 4)).toEqual({ value: 'abcd', caret: 4 });
	});
});

describe('backspace', () => {
	it('deletes the character before the caret', () => {
		expect(backspace('Milkk', 5, 5)).toEqual({ value: 'Milk', caret: 4 });
	});

	it('does nothing at the start', () => {
		expect(backspace('Milk', 0, 0)).toEqual({ value: 'Milk', caret: 0 });
	});

	it('deletes a selection', () => {
		expect(backspace('Oat milk', 0, 4)).toEqual({ value: 'milk', caret: 0 });
	});

	it('deletes a whole emoji, not half of one', () => {
		expect(backspace('Cake 🎂', 7, 7)).toEqual({ value: 'Cake ', caret: 5 });
	});
});

describe('startsSentence', () => {
	it('capitalises the start of the box and of a new sentence', () => {
		expect(startsSentence('')).toBe(true);
		expect(startsSentence('Milk. ')).toBe(true);
		expect(startsSentence('Oat ')).toBe(false);
	});
});

describe('layers', () => {
	it('has a pound sign, and every row fits ten keys wide', () => {
		expect(layers.symbols.flat().some((k) => k.kind === 'char' && k.char === '£')).toBe(true);
		for (const layer of Object.values(layers)) for (const row of layer) expect(row.length).toBeLessThanOrEqual(11);
	});
});
