import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleHousehold } from '#lib/household.ts';
import { dayKey } from '#lib/time.ts';

// A fixed moment, so today's word is known: 24 November 2026, mid-morning in the UK.
vi.mock('$app/env/private', () => ({ HUB_NOW: '2026-11-24T10:00:00Z', CALENDAR_SOURCE: 'sample' }));

const { gameToPlay, makeGo, playerCards, gamesSetup, streakOf } = await import('./index.ts');
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
		expect(result.ok && result.end).toBeFalsy();
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

	it('gives the word, the streak and everyone’s results when the game is solved', () => {
		const setup = setupWith();
		makeGo(setup, 'ross', ANSWER);
		makeGo(setup, 'leo', MISSES[0]!);
		const result = makeGo(setup, 'leo', ANSWER);
		expect(result).toMatchObject({
			ok: true,
			go: { word: ANSWER, marks: ['right', 'right', 'right', 'right', 'right'] },
			state: 'solved',
			end: { answer: ANSWER, streak: 1 }
		});
		const cards = result.ok ? result.end!.cards : [];
		expect(cards.map((c) => [c.member, c.state, c.goes])).toEqual([
			['ross', 'solved', 1],
			['sam', 'new', 0],
			['maya', 'new', 0],
			['leo', 'solved', 2]
		]);
		expect(JSON.stringify(cards)).not.toContain(ANSWER);
	});

	it('gives the word after six goes without it, keeps the streak, and takes no more', () => {
		const setup = setupWith();
		for (const word of MISSES.slice(0, 5)) expect(makeGo(setup, 'leo', word)).toMatchObject({ state: 'playing' });
		expect(makeGo(setup, 'leo', MISSES[5]!)).toMatchObject({
			ok: true,
			state: 'lost',
			end: { answer: ANSWER, streak: 1 }
		});
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

	it('has streaks: Maya six days, Leo four and Sam three, and Ross only today', async () => {
		const setup = await gamesSetup();
		expect(playerCards(setup, DAY).map((c) => [c.member, c.streak])).toEqual([
			['ross', 1],
			['sam', 3],
			['maya', 6],
			['leo', 4]
		]);
	});
});

describe('streakOf', () => {
	// A game finished on each of the days given, before today.
	const storeWith = (days: string[]) => {
		const store = openGameStore(':memory:');
		for (const day of days) store.record({ day, member: 'leo', word: wordFor(day, answers), at: `${day}T07:00:00Z` });
		return store;
	};

	it('counts the days in a row with a finished game, up to today', () => {
		const store = storeWith(['2026-11-22', '2026-11-23', '2026-11-24']);
		expect(streakOf(store, 'leo', DAY)).toBe(3);
	});

	it('still counts yesterday’s streak until today’s game is played', () => {
		expect(streakOf(storeWith(['2026-11-22', '2026-11-23']), 'leo', DAY)).toBe(2);
	});

	it('ends with a day that has no finished game', () => {
		expect(streakOf(storeWith(['2026-11-20', '2026-11-21', '2026-11-23']), 'leo', DAY)).toBe(1);
		expect(streakOf(storeWith(['2026-11-20', '2026-11-21']), 'leo', DAY)).toBe(0);
	});

	it('counts a game lost after six goes, but not one left partway', () => {
		const store = storeWith(['2026-11-23']);
		const misses = (day: string, n: number) => {
			const answer = wordFor(day, answers);
			for (const word of ['storm', 'clean', 'brick', 'judge', 'tiger', 'beach', 'house']
				.filter((w) => w !== answer)
				.slice(0, n))
				store.record({ day, member: 'leo', word, at: `${day}T07:00:00Z` });
		};
		misses('2026-11-22', 6);
		misses('2026-11-21', 3);
		expect(streakOf(store, 'leo', DAY)).toBe(2);
	});

	it('keeps each Member’s streak apart', () => {
		expect(streakOf(storeWith(['2026-11-24']), 'maya', DAY)).toBe(0);
	});
});

describe('Stars', () => {
	it('are never given or taken by games', async () => {
		const { openHubDatabase } = await import('../hub-db.ts');
		const db = openHubDatabase(':memory:');
		const setup = setupWith(openGameStore(db));
		makeGo(setup, 'leo', MISSES[0]!);
		makeGo(setup, 'leo', ANSWER);
		expect(db.prepare('SELECT count(*) AS n FROM chore_events').get()).toEqual({ n: 0 });
		db.close();
	});
});
