import { describe, expect, it } from 'vitest';
import { gameState, keyboardMarks, score, type Go } from './word-game.ts';

const go = (answer: string, word: string): Go => ({ word, marks: score(answer, word) });

describe('score', () => {
	it('marks right places, letters elsewhere in the word, and letters not in it', () => {
		expect(score('plant', 'storm')).toEqual(['absent', 'present', 'absent', 'absent', 'absent']);
		expect(score('plant', 'clean')).toEqual(['absent', 'right', 'absent', 'present', 'present']);
		expect(score('plant', 'plant')).toEqual(['right', 'right', 'right', 'right', 'right']);
	});

	it('marks a letter guessed more often than it’s in the word absent for the extras', () => {
		expect(score('apple', 'paper')).toEqual(['present', 'present', 'right', 'present', 'absent']);
		expect(score('plant', 'llama')).toEqual(['absent', 'right', 'right', 'absent', 'absent']);
	});

	it('counts right places before letters elsewhere', () => {
		// One L in the answer, in the second place: the first L is the extra.
		expect(score('plant', 'lloyd')).toEqual(['absent', 'right', 'absent', 'absent', 'absent']);
	});

	it('marks a doubled letter twice when the answer has it twice', () => {
		expect(score('geese', 'eerie')).toEqual(['present', 'right', 'absent', 'absent', 'right']);
	});
});

describe('keyboardMarks', () => {
	it('gives each letter its best mark so far', () => {
		const marks = keyboardMarks([go('plant', 'storm'), go('plant', 'clean')]);
		expect(marks.get('t')).toBe('present');
		expect(marks.get('l')).toBe('right');
		expect(marks.get('a')).toBe('present');
		expect(marks.get('s')).toBe('absent');
		expect(marks.has('p')).toBe(false);
	});

	it('never lowers a letter’s mark', () => {
		const marks = keyboardMarks([go('plant', 'clean'), go('plant', 'lilac')]);
		expect(marks.get('l')).toBe('right');
	});
});

describe('gameState', () => {
	it('is new with no goes, playing until solved, and lost after six', () => {
		expect(gameState([])).toBe('new');
		expect(gameState([go('plant', 'storm')])).toBe('playing');
		expect(gameState([go('plant', 'storm'), go('plant', 'plant')])).toBe('solved');
		expect(gameState(Array.from({ length: 6 }, () => go('plant', 'storm')))).toBe('lost');
	});

	it('is solved on the sixth go if that one is right', () => {
		const goes = [...Array.from({ length: 5 }, () => go('plant', 'storm')), go('plant', 'plant')];
		expect(gameState(goes)).toBe('solved');
	});
});
