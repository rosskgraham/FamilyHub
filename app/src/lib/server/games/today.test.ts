import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from '#lib/time.ts';
import { wordFor } from './today.ts';
import { answers } from './words.ts';

describe('wordFor', () => {
	it('gives the same word for the same date, every time', () => {
		expect(wordFor('2026-11-24', answers)).toBe(wordFor('2026-11-24', [...answers]));
		expect(wordFor('2026-11-24', answers)).toBe(wordFor('2026-11-24', answers));
	});

	it('gives a word from the answer list', () => {
		expect(answers).toContain(wordFor('2026-11-24', answers));
	});

	it('never repeats a word until the whole list has been used', () => {
		const seen = new Set<string>();
		for (let i = 0; i < answers.length; i++) seen.add(wordFor(addDays('2026-01-01', i), answers));
		expect(seen.size).toBe(answers.length);
		expect(wordFor(addDays('2026-01-01', answers.length), answers)).toBe(wordFor('2026-01-01', answers));
	});

	it('keeps each day’s word as it was', () => {
		// Recorded from main before the generator moved to random.ts for Number of the day (AB#90).
		const words = { '2025-12-31': 'craft', '2026-01-01': 'gnome', '2026-11-26': 'bliss', '2030-12-31': 'burnt' };
		for (const [day, word] of Object.entries(words)) expect(wordFor(day, answers)).toBe(word);
	});

	it('isn’t simply the list in order', () => {
		const days = Array.from({ length: 5 }, (_, i) => wordFor(addDays('2026-01-01', i), answers));
		expect(days).not.toEqual(answers.slice(0, 5));
	});

	it('changes at midnight in the UK, not UTC', () => {
		// 23:30 UTC on 24 June is 00:30 on 25 June in British Summer Time.
		expect(dayKey(new Date('2026-06-24T23:30:00Z'))).toBe('2026-06-25');
		expect(wordFor(dayKey(new Date('2026-06-24T23:30:00Z')), answers)).toBe(wordFor('2026-06-25', answers));
		expect(wordFor(dayKey(new Date('2026-06-24T22:59:00Z')), answers)).toBe(wordFor('2026-06-24', answers));
	});

	it('works across the clocks changing and before the first day', () => {
		const days = ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26'];
		const words = days.map((d) => wordFor(d, answers));
		expect(new Set(words).size).toBe(days.length);
		expect(answers).toContain(wordFor('2025-12-31', answers));
	});
});
