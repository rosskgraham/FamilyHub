import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { answers, isAllowedGuess } from './words.ts';

const file = (name: string) => readFileSync(new URL(`./words/${name}`, import.meta.url), 'utf8');
const lines = (text: string) => text.split(/\r?\n/).filter((line) => line !== '');

describe('the committed word lists', () => {
	const guesses = lines(file('guesses.txt'));

	it('has at least two years of answers, each five letters a–z, with no duplicates', () => {
		expect(answers.length).toBeGreaterThanOrEqual(730);
		for (const word of answers) expect(word).toMatch(/^[a-z]{5}$/);
		expect(new Set(answers).size).toBe(answers.length);
	});

	it('accepts every answer as a guess', () => {
		const allowed = new Set(guesses);
		expect(answers.filter((word) => !allowed.has(word))).toEqual([]);
	});

	it('keeps the guesses sorted, unique and five letters a–z', () => {
		for (const word of guesses) expect(word).toMatch(/^[a-z]{5}$/);
		expect(guesses).toEqual([...new Set(guesses)].sort());
	});

	it('keeps SCOWL’s copyright notice beside the lists', () => {
		expect(file('SCOWL-Copyright.txt')).toContain('Kevin Atkinson');
	});
});

describe('the words module', () => {
	it('gives the answers in the answer list’s own order', () => {
		expect(answers).toEqual(lines(file('answers.txt')));
	});

	it('accepts allowed guesses in any case', () => {
		expect(isAllowedGuess('plant')).toBe(true);
		expect(isAllowedGuess('PLANT')).toBe(true);
		expect(isAllowedGuess('Plant')).toBe(true);
	});

	it('refuses words it doesn’t know', () => {
		expect(isAllowedGuess('qzxjv')).toBe(false);
		expect(isAllowedGuess('plan')).toBe(false);
		expect(isAllowedGuess('plants')).toBe(false);
		expect(isAllowedGuess('')).toBe(false);
	});
});
