import { describe, expect, it } from 'vitest';
import { gameState, gameStatus, keyboardMarks, score, streak, type Go } from './word-game.ts';

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

describe('streak', () => {
	const days = (...d: string[]) => new Set(d);

	it('counts the days in a row with a finished game, ending today', () => {
		expect(streak(days('2026-11-22', '2026-11-23', '2026-11-24'), '2026-11-24')).toBe(3);
	});

	it('keeps yesterday’s streak while today isn’t played yet', () => {
		expect(streak(days('2026-11-22', '2026-11-23'), '2026-11-24')).toBe(2);
	});

	it('ends at a day with no finished game', () => {
		expect(streak(days('2026-11-21', '2026-11-23', '2026-11-24'), '2026-11-24')).toBe(2);
		expect(streak(days('2026-11-21', '2026-11-22'), '2026-11-24')).toBe(0);
		expect(streak(days(), '2026-11-24')).toBe(0);
	});

	it('runs across the clocks changing, spring and autumn', () => {
		expect(streak(days('2026-03-28', '2026-03-29', '2026-03-30'), '2026-03-30')).toBe(3);
		expect(streak(days('2026-10-24', '2026-10-25', '2026-10-26'), '2026-10-26')).toBe(3);
	});
});

describe('gameStatus', () => {
	it('says where a game is in words', () => {
		expect(gameStatus('new', 0)).toBe('Not played yet');
		expect(gameStatus('playing', 2)).toBe('2 of 6 goes so far');
		expect(gameStatus('solved', 4)).toBe('Got it in 4');
		expect(gameStatus('lost', 6)).toBe('Not this time');
	});
});
