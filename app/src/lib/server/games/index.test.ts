import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleHousehold } from '#lib/household.ts';
import { dayKey } from '#lib/time.ts';

// A fixed moment, so today's word is known: 24 November 2026, mid-morning in the UK.
vi.mock('$app/env/private', () => ({ HUB_NOW: '2026-11-24T10:00:00Z', CALENDAR_SOURCE: 'sample' }));

const { gameToPlay, makeGo, playerCards, gamesSetup } = await import('./index.ts');
const { openGameStore } = await import('./store.ts');
const { wordFor } = await import('./today.ts');
const { answers } = await import('./words.ts');

const DAY = '2026-11-24';
const ANSWER = wordFor(DAY, answers);
// Allowed words that aren't today's answer.
const MISSES = ['storm', 'clean', 'brick', 'judge', 'plant', 'tiger', 'beach'].filter((w) => w !== ANSWER);

const setupWith = (store = openGameStore(':memory:')) => ({ household: sampleHousehold, store, sample: true });

describe('makeGo', () => {
	it('marks a go and saves it', () => {
		const setup = setupWith();
		const result = makeGo(setup, 'leo', MISSES[0]!);
		expect(result).toMatchObject({ ok: true, state: 'playing', go: { word: MISSES[0] } });
		expect(result.ok && result.answer).toBeFalsy();
		expect(setup.store.goes(DAY)).toEqual([
			{ day: DAY, member: 'leo', word: MISSES[0], at: '2026-11-24T10:00:00.000Z' }
		]);
	});

	it('accepts any case', () => {
		expect(makeGo(setupWith(), 'leo', MISSES[0]!.toUpperCase())).toMatchObject({ ok: true });
	});

	it('uses no go for fewer than five letters, or a word it doesn’t know', () => {
		const setup = setupWith();
		expect(makeGo(setup, 'leo', 'pla')).toEqual({ ok: false, problem: 'too short' });
		expect(makeGo(setup, 'leo', 'qzxjv')).toEqual({ ok: false, problem: 'not a word' });
		expect(setup.store.goes(DAY)).toEqual([]);
	});

	it('only lets the Household’s Members play', () => {
		expect(makeGo(setupWith(), 'everyone', MISSES[0]!)).toEqual({ ok: false, problem: 'not a player' });
		expect(makeGo(setupWith(), 'nobody', MISSES[0]!)).toEqual({ ok: false, problem: 'not a player' });
	});

	it('gives the word when the game is solved', () => {
		const setup = setupWith();
		makeGo(setup, 'leo', MISSES[0]!);
		expect(makeGo(setup, 'leo', ANSWER)).toEqual({
			ok: true,
			go: { word: ANSWER, marks: ['right', 'right', 'right', 'right', 'right'] },
			state: 'solved',
			answer: ANSWER
		});
	});

	it('gives the word after six goes without it, and takes no more', () => {
		const setup = setupWith();
		for (const word of MISSES.slice(0, 5)) expect(makeGo(setup, 'leo', word)).toMatchObject({ state: 'playing' });
		expect(makeGo(setup, 'leo', MISSES[5]!)).toMatchObject({ ok: true, state: 'lost', answer: ANSWER });
		expect(makeGo(setup, 'leo', MISSES[0]!)).toEqual({ ok: false, problem: 'finished' });
	});

	it('keeps each Member’s game apart', () => {
		const setup = setupWith();
		makeGo(setup, 'leo', ANSWER);
		expect(makeGo(setup, 'maya', MISSES[0]!)).toMatchObject({ ok: true, state: 'playing' });
	});
});

describe('playerCards', () => {
	it('says where each Member is, in the Household’s order, with only the marks of a finished game', () => {
		const setup = setupWith();
		makeGo(setup, 'ross', MISSES[0]!);
		makeGo(setup, 'ross', ANSWER);
		makeGo(setup, 'leo', MISSES[1]!);
		const cards = playerCards(setup, DAY);
		expect(cards.map((c) => [c.member, c.state, c.goes])).toEqual([
			['ross', 'solved', 2],
			['sam', 'new', 0],
			['maya', 'new', 0],
			['leo', 'playing', 1]
		]);
		expect(cards[0]!.marks).toHaveLength(2);
		expect(cards[3]!.marks).toEqual([]);
		expect(JSON.stringify(cards)).not.toContain(ANSWER);
	});
});

describe('gameToPlay', () => {
	it('gives a game to carry on, and nothing for a finished one', () => {
		const setup = setupWith();
		expect(gameToPlay(setup, 'leo', DAY)).toEqual({ goes: [], state: 'new' });
		makeGo(setup, 'leo', MISSES[0]!);
		expect(gameToPlay(setup, 'leo', DAY)?.goes.map((g) => g.word)).toEqual([MISSES[0]]);
		makeGo(setup, 'leo', ANSWER);
		expect(gameToPlay(setup, 'leo', DAY)).toBeNull();
	});
});

describe('saving goes', () => {
	let dir: string;
	beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'familyhub-games-'))));
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('carries a game on after the Hub restarts', () => {
		const path = join(dir, 'hub.db');
		const before = openGameStore(path);
		makeGo(setupWith(before), 'leo', MISSES[0]!);
		makeGo(setupWith(before), 'leo', MISSES[1]!);
		before.close();

		const after = openGameStore(path);
		expect(gameToPlay(setupWith(after), 'leo', DAY)?.goes.map((g) => g.word)).toEqual(MISSES.slice(0, 2));
		after.close();
	});
});

describe('the sample', () => {
	it('has Ross solved in three, Maya in four, Leo partway and Sam not played', async () => {
		const setup = await gamesSetup();
		expect(setup.sample).toBe(true);
		expect(
			playerCards(setup, dayKey(new Date('2026-11-24T10:00:00Z'))).map((c) => [c.member, c.state, c.goes])
		).toEqual([
			['ross', 'solved', 3],
			['sam', 'new', 0],
			['maya', 'solved', 4],
			['leo', 'playing', 2]
		]);
	});
});
