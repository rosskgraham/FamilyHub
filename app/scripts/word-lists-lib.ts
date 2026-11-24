// What scripts/word-lists.mjs decides, kept apart from what it runs so it can be tested (AB#67). Node runs this file
// as it is, so it uses only Node's own modules and TypeScript that can be stripped away.
//
// The lists come from SCOWL's database (scowl.db, built from https://github.com/en-wl/wordlist), through its
// scowl_v0 view: one row per word, part of speech and spelling, with how common it is as a size from 35 (the most
// common) upwards.
import type { DatabaseSync } from 'node:sqlite';

/** The largest SCOWL size an allowed guess can come from. 70 is SCOWL's large spellchecker dictionary. */
export const GUESS_SIZE = 70;
/** The largest SCOWL size an answer candidate can come from. 35 is SCOWL's smallest, most common size. */
export const ANSWER_SIZE = 35;
/** SCOWL's spellings kept in guesses: every dialect (_), American (A) and British, -ise (B) and -ize (Z). */
export const GUESS_SPELLINGS = ['_', 'A', 'B', 'Z'];
/** Answers are in British spelling, so COLOR is a guess but never an answer. */
export const ANSWER_SPELLINGS = ['_', 'B', 'Z'];
/** SCOWL's variant level: 0 and 1 are the usual spellings, higher ones rarer alternatives such as "gaol". */
export const MAX_VARIANT_LEVEL = 1;
/** SCOWL's regions kept in answers: words used everywhere, or in Britain, so never Australian slang such as "chook". */
export const ANSWER_REGIONS = ['', 'GB'];
/** Parts of speech that are a word's own form, not a plural or tense, so an answer is never TREES or JUMPS. */
export const ANSWER_POSES = ['n0', 'm0', 'v0', 'aj0', 'av0', 'a0', 'i', 'c', 'pre'];

export interface ScowlRow {
	word: string;
	size: number;
	spelling: string;
	region: string;
	variant_level: number;
	category: string;
	pos: string;
	pos_category: string;
	usage_note: string;
}

/** Five lowercase letters a–z: no capitals (names and places), apostrophes, accents or dots. */
export function isFiveLetterWord(word: string): boolean {
	return /^[a-z]{5}$/.test(word);
}

// A row that could be a word in the game at all: not a Roman numeral or programmers' slang (SCOWL's categories), not
// an abbreviation, and not a non-word such as "hmmmm".
function isPlainWord(row: ScowlRow): boolean {
	return (
		isFiveLetterWord(row.word) &&
		row.variant_level <= MAX_VARIANT_LEVEL &&
		row.category === '' &&
		row.pos !== 'abbr' &&
		row.pos_category === ''
	);
}

const sorted = (words: Iterable<string>) => [...new Set(words)].sort();

/** Every allowed guess, sorted. Rude words stay in: they're only ever seen if someone types one. */
export function guessesFrom(rows: Iterable<ScowlRow>): string[] {
	const words: string[] = [];
	for (const row of rows) {
		if (isPlainWord(row) && row.size <= GUESS_SIZE && GUESS_SPELLINGS.includes(row.spelling)) words.push(row.word);
	}
	return sorted(words);
}

/**
 * The words that could be answers, sorted: SCOWL's most common words, in their own form and British spelling, and not regional to anywhere but Britain. A word
 * with a usage note on any of its rows, such as vulgar, offensive or informal, is never a candidate.
 */
export function answerCandidatesFrom(rows: Iterable<ScowlRow>): string[] {
	const noted = new Set<string>();
	const words: string[] = [];
	for (const row of rows) {
		if (row.usage_note !== '') noted.add(row.word);
		if (
			isPlainWord(row) &&
			row.size <= ANSWER_SIZE &&
			ANSWER_SPELLINGS.includes(row.spelling) &&
			ANSWER_REGIONS.includes(row.region) &&
			ANSWER_POSES.includes(row.pos)
		) {
			words.push(row.word);
		}
	}
	return sorted(words.filter((word) => !noted.has(word)));
}

/** Candidates not already in the answer list, which is edited by hand and never written by the script. */
export function newCandidates(candidates: readonly string[], answers: readonly string[]): string[] {
	const have = new Set(answers);
	return candidates.filter((word) => !have.has(word));
}

/** The five-letter rows of SCOWL's database. */
export function readScowl(db: DatabaseSync): ScowlRow[] {
	return db
		.prepare(
			`SELECT word, size, spelling, region, variant_level, category, pos, pos_category, usage_note
			   FROM scowl_v0 WHERE length(word) = 5`
		)
		.all() as unknown as ScowlRow[];
}

/** A word list file: one word per line, ending with a newline. */
export function formatList(words: readonly string[]): string {
	return words.map((word) => `${word}\n`).join('');
}

/** The words in a word list file, ignoring blank lines. */
export function parseList(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '');
}
