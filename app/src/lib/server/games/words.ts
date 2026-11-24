// Word of the day's word lists (AB#67), made from SCOWL by scripts/word-lists.mjs; see words/SCOWL-Copyright.txt.
// They stay on the server, so the answers never reach a browser before a game is finished.
import answersText from './words/answers.txt?raw';
import guessesText from './words/guesses.txt?raw';

const parse = (text: string) => text.split(/\r?\n/).filter((line) => line !== '');

/** Every possible answer, in the answer list's own fixed order. */
export const answers: readonly string[] = parse(answersText);

const guesses = new Set(parse(guessesText));

/** Whether a word is one the Hub accepts as a guess, in any case. */
export function isAllowedGuess(word: string): boolean {
	return guesses.has(word.toLowerCase());
}
