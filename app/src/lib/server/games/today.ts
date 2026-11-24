import type { DayKey } from '#lib/time.ts';

// Today's word (AB#68): the same for everyone, worked out from the date, so it needs no server and works offline. The
// answer list is stepped through in a fixed shuffled order, a new word each day at midnight.

/** The day the order starts from. Changing it changes every day's word. */
const FIRST_DAY = Date.UTC(2026, 0, 1);
/** The shuffle's seed. Changing it changes every day's word. */
const SEED = 0x5eed_0068;

// A small, fast generator (mulberry32) that gives the same numbers for the same seed on every machine.
function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const orders = new WeakMap<readonly string[], number[]>();

function order(length: number): number[] {
	const next = random(SEED);
	const indexes = Array.from({ length }, (_, i) => i);
	for (let i = length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[indexes[i], indexes[j]] = [indexes[j]!, indexes[i]!];
	}
	return indexes;
}

/** The word for a day. After the last word of the order it starts again from the first. */
export function wordFor(day: DayKey, answers: readonly string[]): string {
	let indexes = orders.get(answers);
	if (!indexes) orders.set(answers, (indexes = order(answers.length)));
	const days = Math.round((Date.parse(`${day}T00:00:00Z`) - FIRST_DAY) / 86_400_000);
	const n = answers.length;
	return answers[indexes[((days % n) + n) % n]!]!;
}
