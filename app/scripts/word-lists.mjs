// Makes Word of the day's word lists from SCOWL's database (AB#67). Build scowl.db first from
// https://github.com/en-wl/wordlist (branch v2, `make`, or `python combine.py create-db scowl.db` with PYTHONUTF8=1 on
// Windows), then:
//
//   node scripts/word-lists.mjs <path to scowl.db>
//
// It writes the allowed guesses, src/lib/server/games/words/guesses.txt, in full. It never writes the answers,
// answers.txt, which are chosen by hand: it prints the candidates that aren't in it yet, to add any worth having.
// The database isn't committed, and the Hub never reads it.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
	answerCandidatesFrom,
	formatList,
	guessesFrom,
	newCandidates,
	parseList,
	readScowl
} from './word-lists-lib.ts';

const words = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'server', 'games', 'words');

const path = process.argv[2];
if (!path) {
	console.error('Usage: node scripts/word-lists.mjs <path to scowl.db>');
	process.exit(1);
}

const db = new DatabaseSync(path, { readOnly: true });
const rows = readScowl(db);
db.close();

const guesses = guessesFrom(rows);
writeFileSync(join(words, 'guesses.txt'), formatList(guesses));
console.log(`Wrote ${guesses.length} allowed guesses to guesses.txt.`);

const answers = parseList(readFileSync(join(words, 'answers.txt'), 'utf8'));
const fresh = newCandidates(answerCandidatesFrom(rows), answers);
console.log(`answers.txt has ${answers.length} words, unchanged. ${fresh.length} candidates aren't in it:`);
if (fresh.length) console.log(fresh.join(' '));
