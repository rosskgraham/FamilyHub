import { describe, expect, it, vi } from 'vitest';
import { sampleHousehold } from '#lib/household.ts';

// A fixed moment, so today's numbers are known: 24 November 2026, mid-morning in the UK. That day draws 100, 75, 50,
// 7, 4 and 4, with 605 to reach.
vi.mock('$app/env/private', () => ({ HUB_NOW: '2026-11-24T10:00:00Z', CALENDAR_SOURCE: 'sample' }));

const { makeNumberMove, numberCards, numberGameToPlay } = await import('./number-play.ts');
const { openGameStore } = await import('./store.ts');
const { seedNumberSample } = await import('./sample-numbers.ts');
const { drawFor } = await import('./numbers.ts');

const DAY = '2026-11-24';
const setupWith = (store = openGameStore(':memory:')) => ({ household: sampleHousehold, store, sample: true });

describe('makeNumberMove', () => {
	it('makes a step, saves it, and puts the answer at the end of the numbers', () => {
		const setup = setupWith();
		const result = makeNumberMove(setup, 'leo', { kind: 'step', a: 4, op: '+', b: 4 });
		expect(result).toEqual({
			ok: true,
			game: {
				numbers: [100, 75, 50, 7, 8],
				target: 605,
				steps: [{ a: 4, op: '+', b: 4, answer: 8 }],
				state: 'playing',
				away: null
			}
		});
		expect(setup.store.numberSteps(DAY)).toEqual([
			{ day: DAY, member: 'leo', a: 4, op: '+', b: 4, at: '2026-11-24T10:00:00.000Z' }
		]);
	});

	it('refuses a step that gives zero, a negative or a fraction, or uses a number that isn’t left, and saves nothing', () => {
		const setup = setupWith();
		expect(makeNumberMove(setup, 'leo', { kind: 'step', a: 4, op: '−', b: 4 })).toEqual({ ok: false, problem: 'zero' });
		expect(makeNumberMove(setup, 'leo', { kind: 'step', a: 7, op: '−', b: 50 })).toEqual({
			ok: false,
			problem: 'negative'
		});
		expect(makeNumberMove(setup, 'leo', { kind: 'step', a: 7, op: '÷', b: 4 })).toEqual({
			ok: false,
			problem: 'fraction'
		});
		expect(makeNumberMove(setup, 'leo', { kind: 'step', a: 7, op: '+', b: 7 })).toEqual({
			ok: false,
			problem: 'not-left'
		});
		expect(setup.store.numberSteps(DAY)).toEqual([]);
	});

	it('takes back the last step with Undo, and every step with Start again', () => {
		const setup = setupWith();
		makeNumberMove(setup, 'leo', { kind: 'step', a: 4, op: '+', b: 4 });
		makeNumberMove(setup, 'leo', { kind: 'step', a: 75, op: '×', b: 8 });
		makeNumberMove(setup, 'sam', { kind: 'step', a: 100, op: '+', b: 7 });
		const undone = makeNumberMove(setup, 'leo', { kind: 'undo' });
		expect(undone.ok && undone.game.numbers).toEqual([100, 75, 50, 7, 8]);
		const again = makeNumberMove(setup, 'leo', { kind: 'restart' });
		expect(again.ok && again.game).toMatchObject({ numbers: [100, 75, 50, 7, 4, 4], steps: [], state: 'new' });
		// Only Leo's steps went.
		expect(setup.store.numberSteps(DAY)).toHaveLength(1);
	});

	it('finishes the game when a step makes the target', () => {
		const setup = setupWith();
		for (const step of [
			{ a: 4, op: '+', b: 4 },
			{ a: 75, op: '×', b: 8 },
			{ a: 100, op: '÷', b: 50 },
			{ a: 7, op: '−', b: 2 }
		] as const)
			makeNumberMove(setup, 'leo', { kind: 'step', ...step });
		const result = makeNumberMove(setup, 'leo', { kind: 'step', a: 600, op: '+', b: 5 });
		expect(result.ok && result.game).toMatchObject({ state: 'got', away: 0 });
		expect(setup.store.numberResults(DAY)).toEqual([
			{ day: DAY, member: 'leo', value: 605, at: '2026-11-24T10:00:00.000Z' }
		]);
	});

	it('finishes with a number that’s left, how far it is from the target', () => {
		const setup = setupWith();
		makeNumberMove(setup, 'leo', { kind: 'step', a: 4, op: '+', b: 4 });
		makeNumberMove(setup, 'leo', { kind: 'step', a: 75, op: '×', b: 8 });
		expect(makeNumberMove(setup, 'leo', { kind: 'finish', value: 4 })).toEqual({ ok: false, problem: 'not left' });
		const result = makeNumberMove(setup, 'leo', { kind: 'finish', value: 600 });
		expect(result.ok && result.game).toMatchObject({ state: 'away', away: 5 });
	});

	it('makes no move in a finished game, or for someone who isn’t a player', () => {
		const setup = setupWith();
		makeNumberMove(setup, 'leo', { kind: 'finish', value: 100 });
		expect(makeNumberMove(setup, 'leo', { kind: 'undo' })).toEqual({ ok: false, problem: 'finished' });
		expect(makeNumberMove(setup, 'everyone', { kind: 'undo' })).toEqual({ ok: false, problem: 'not a player' });
		expect(makeNumberMove(setup, 'nobody', { kind: 'undo' })).toEqual({ ok: false, problem: 'not a player' });
	});

	it('never sends a way to reach the target', () => {
		const result = makeNumberMove(setupWith(), 'leo', { kind: 'step', a: 4, op: '+', b: 4 });
		expect(Object.keys(result.ok ? result.game : {}).sort()).toEqual(['away', 'numbers', 'state', 'steps', 'target']);
	});
});

describe('numberCards and numberGameToPlay', () => {
	it('says where each Member is, in the Household’s order, without their steps', () => {
		const setup = setupWith();
		seedNumberSample(setup.store, DAY);
		expect(numberCards(setup, DAY)).toEqual([
			{ member: 'ross', state: 'away', steps: 1, away: 455 },
			{ member: 'sam', state: 'new', steps: 0, away: null },
			{ member: 'maya', state: 'got', steps: 5, away: 0 },
			{ member: 'leo', state: 'playing', steps: 2, away: null }
		]);
	});

	it('gives a game to carry on, but not one that’s finished', () => {
		const setup = setupWith();
		seedNumberSample(setup.store, DAY);
		expect(numberGameToPlay(setup, 'leo', DAY)).toMatchObject({ numbers: [50, 7, 8, 175], state: 'playing' });
		expect(numberGameToPlay(setup, 'maya', DAY)).toBeNull();
		expect(numberGameToPlay(setup, 'ross', DAY)).toBeNull();
	});

	it('starts everyone afresh with new numbers the next day', () => {
		const setup = setupWith();
		seedNumberSample(setup.store, DAY);
		const tomorrow = '2026-11-25';
		expect(numberCards(setup, tomorrow).every((card) => card.state === 'new')).toBe(true);
		expect(numberGameToPlay(setup, 'maya', tomorrow)).toMatchObject({ ...drawFor(tomorrow), steps: [] });
	});
});

describe('the game chosen', () => {
	it('is Word of the day until another is chosen, and again from midnight', () => {
		const store = openGameStore(':memory:');
		expect(store.chosenGame(DAY)).toBe('word');
		store.chooseGame('numbers', DAY);
		expect(store.chosenGame(DAY)).toBe('numbers');
		expect(store.chosenGame('2026-11-25')).toBe('word');
		store.chooseGame('word', DAY);
		expect(store.chosenGame(DAY)).toBe('word');
	});
});
