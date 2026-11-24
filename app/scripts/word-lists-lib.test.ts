import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
	answerCandidatesFrom,
	formatList,
	guessesFrom,
	isFiveLetterWord,
	newCandidates,
	parseList,
	readScowl,
	type ScowlRow
} from './word-lists-lib.ts';

// A row of SCOWL's scowl_v0 view: a common, everyday noun unless a test says otherwise.
const row = (word: string, fields: Partial<ScowlRow> = {}): ScowlRow => ({
	word,
	size: 35,
	spelling: '_',
	region: '',
	variant_level: 0,
	category: '',
	pos: 'n0',
	pos_category: '',
	usage_note: '',
	...fields
});

describe('isFiveLetterWord', () => {
	it('takes five lowercase letters a–z', () => {
		expect(isFiveLetterWord('plant')).toBe(true);
	});

	it('refuses capitals, apostrophes, accents, dots and other lengths', () => {
		for (const word of ['Paris', "can't", 'abbés', 'etc..', 'plan', 'plants', 'ab-cd']) {
			expect(isFiveLetterWord(word)).toBe(false);
		}
	});
});

describe('guessesFrom', () => {
	it('keeps plain five-letter words up to the large size, sorted and once each', () => {
		expect(guessesFrom([row('tiger'), row('plant'), row('plant', { pos: 'v0' }), row('aglet', { size: 70 })])).toEqual([
			'aglet',
			'plant',
			'tiger'
		]);
	});

	it('leaves out words only in the very largest sizes', () => {
		expect(guessesFrom([row('zymic', { size: 80 })])).toEqual([]);
	});

	it('keeps both British and American spellings', () => {
		expect(guessesFrom([row('color', { spelling: 'A' }), row('mould', { spelling: 'B' })])).toEqual(['color', 'mould']);
	});

	it('leaves out Canadian- and Australian-only spellings and rare variants', () => {
		expect(guessesFrom([row('aaaaa', { spelling: 'C' }), row('bbbbb', { spelling: 'D' })])).toEqual([]);
		expect(guessesFrom([row('gaols', { variant_level: 3 })])).toEqual([]);
	});

	it('leaves out capitalised words, apostrophes, accents and abbreviations', () => {
		expect(guessesFrom([row('Paris'), row("o'neil"), row('abbés'), row('abbrs', { pos: 'abbr' })])).toEqual([]);
	});

	it("leaves out Roman numerals, programmers' slang and non-words", () => {
		expect(
			guessesFrom([
				row('xviii', { category: 'roman-numerals' }),
				row('grepd', { category: 'hacker' }),
				row('hmmmm', { pos_category: 'nonword' })
			])
		).toEqual([]);
	});

	it('keeps rude words', () => {
		expect(guessesFrom([row('arses', { usage_note: 'vulgar-3' })])).toEqual(['arses']);
	});
});

describe('answerCandidatesFrom', () => {
	it('keeps the most common words in their own form', () => {
		expect(answerCandidatesFrom([row('plant'), row('happy', { pos: 'aj0' }), row('build', { pos: 'v0' })])).toEqual([
			'build',
			'happy',
			'plant'
		]);
	});

	it('leaves out less common words', () => {
		expect(answerCandidatesFrom([row('aglet', { size: 40 })])).toEqual([]);
	});

	it('leaves out plurals and tenses', () => {
		expect(answerCandidatesFrom([row('trees', { pos: 'ns' }), row('jumps', { pos: 'vs' })])).toEqual([]);
	});

	it('keeps British spellings and leaves out American-only ones', () => {
		expect(answerCandidatesFrom([row('mould', { spelling: 'B' }), row('color', { spelling: 'A' })])).toEqual(['mould']);
	});

	it('leaves out words regional to anywhere but Britain', () => {
		expect(answerCandidatesFrom([row('chook', { region: 'AU' }), row('maths', { region: 'GB' })])).toEqual(['maths']);
	});

	it('leaves out a word with a usage note on any of its rows', () => {
		expect(answerCandidatesFrom([row('shite'), row('shite', { pos: 'v0', usage_note: 'vulgar-1' })])).toEqual([]);
	});
});

describe('newCandidates', () => {
	it("gives the candidates the answer list doesn't have, and never changes it", () => {
		const answers = ['plant', 'tiger'];
		expect(newCandidates(['beach', 'plant', 'tiger', 'zebra'], answers)).toEqual(['beach', 'zebra']);
		expect(answers).toEqual(['plant', 'tiger']);
	});
});

describe('formatList and parseList', () => {
	it('write one word per line and read it back, ignoring blank lines and Windows line endings', () => {
		expect(formatList(['plant', 'tiger'])).toBe('plant\ntiger\n');
		expect(parseList('plant\r\n\r\ntiger\n')).toEqual(['plant', 'tiger']);
	});

	it('give the same file for the same words, run after run', () => {
		const rows = [row('tiger'), row('plant'), row('beach')];
		expect(formatList(guessesFrom(rows))).toBe(formatList(guessesFrom([...rows].reverse())));
	});
});

describe('readScowl', () => {
	it("reads the five-letter rows of SCOWL's scowl_v0 view", () => {
		const db = new DatabaseSync(':memory:');
		db.exec(`CREATE TABLE scowl_v0 (word TEXT, size INTEGER, spelling TEXT, region TEXT, variant_level INTEGER,
			category TEXT, pos TEXT, pos_category TEXT, usage_note TEXT, base_pos TEXT);
			INSERT INTO scowl_v0 VALUES ('plant', 35, '_', '', 0, '', 'n0', '', '', 'n_v'),
				('plants', 35, '_', '', 0, '', 'ns', '', '', 'n_v');`);
		expect(readScowl(db).map((r) => ({ ...r }))).toEqual([row('plant')]);
	});
});
