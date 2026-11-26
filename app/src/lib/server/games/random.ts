// A small, fast generator (mulberry32) that gives the same numbers for the same seed on every machine, so each day's
// game can be worked out from the date alone (AB#68, AB#90).

/** Numbers from 0 (inclusive) to 1 (exclusive), the same sequence for the same seed. */
export function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Whole days from one day to another, which stays exact across the clocks changing. */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
