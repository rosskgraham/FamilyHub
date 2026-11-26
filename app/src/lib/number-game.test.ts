import { describe, expect, it } from 'vitest';
import { applyStep, calculate, closest, numberResult, numberStatus } from './number-game.ts';

describe('calculate', () => {
	it('adds, takes away, multiplies and divides', () => {
		expect(calculate(75, '+', 8)).toBe(83);
		expect(calculate(75, '−', 8)).toBe(67);
		expect(calculate(75, '×', 8)).toBe(600);
		expect(calculate(75, '÷', 5)).toBe(15);
	});

	it('refuses an answer of zero, a negative or a fraction', () => {
		expect(calculate(4, '−', 4)).toBe('zero');
		expect(calculate(3, '−', 5)).toBe('negative');
		expect(calculate(7, '÷', 2)).toBe('fraction');
	});
});

describe('applyStep', () => {
	it('replaces the two numbers with the answer', () => {
		expect(applyStep([100, 75, 6, 3], 75, '+', 3)).toEqual([100, 6, 78]);
	});

	it('takes out only one of a number there twice', () => {
		expect(applyStep([5, 5, 2], 5, '×', 2)).toEqual([5, 10]);
		expect(applyStep([5, 5, 2], 5, '+', 5)).toEqual([2, 10]);
	});

	it('refuses a number that isn’t left, including using one number twice', () => {
		expect(applyStep([100, 75, 6], 50, '+', 6)).toBe('not-left');
		expect(applyStep([100, 75, 6], 6, '×', 6)).toBe('not-left');
	});

	it('refuses an answer that isn’t allowed, and leaves the numbers as they were', () => {
		const numbers = [7, 2, 4];
		expect(applyStep(numbers, 7, '÷', 2)).toBe('fraction');
		expect(applyStep(numbers, 2, '−', 7)).toBe('negative');
		expect(applyStep(numbers, 4, '−', 4)).toBe('not-left');
		expect(numbers).toEqual([7, 2, 4]);
	});
});

describe('closest', () => {
	it('gives the number nearest the target, the first of them on a tie', () => {
		expect(closest([100, 75, 600, 7], 605)).toBe(600);
		expect(closest([600, 610], 605)).toBe(600);
	});
});

describe('the words on a card', () => {
	it('says where a game is, and how a finished one ended without how it got there', () => {
		expect(numberStatus('new', 0)).toBe('Not played yet');
		expect(numberStatus('playing', 1)).toBe('1 step so far');
		expect(numberStatus('playing', 2)).toBe('2 steps so far');
		expect(numberStatus('got', 5)).toBe('Finished today');
		expect(numberResult('got', 0)).toBe('Got it');
		expect(numberResult('away', 5)).toBe('5 away');
	});
});
