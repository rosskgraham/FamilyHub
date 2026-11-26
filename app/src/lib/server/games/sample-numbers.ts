import { closest } from '#lib/number-game.ts';
import type { DayKey } from '#lib/time.ts';
import { drawFor, solutionFor } from './numbers.ts';
import type { GameStore } from './store.ts';

// Sample games of Number of the day (AB#91), so the Games Section shows each kind of card. Today Maya got it the
// solver's way, Ross added two numbers and finished on the closest one short of the target, Leo is two steps in, and
// Sam hasn't played. Adding two numbers is always allowed, so these work for any day's draw.
export function seedNumberSample(store: GameStore, day: DayKey): void {
	const { numbers, target } = drawFor(day);
	const [n0, n1, n2, n3, n4, n5] = numbers as [number, number, number, number, number, number];
	const at = `${day}T07:00:00.000Z`;
	const add = (member: string, a: number, b: number) => store.recordStep({ day, member, a, op: '+', b, at });

	for (const { a, op, b } of solutionFor(day)) store.recordStep({ day, member: 'maya', a, op, b, at });
	store.recordResult({ day, member: 'maya', value: target, at });

	add('ross', n0, n2);
	const left = [n1, n3, n4, n5, n0 + n2].filter((n) => n !== target);
	store.recordResult({ day, member: 'ross', value: closest(left, target), at });

	add('leo', n4, n5);
	add('leo', n0, n1);
}
