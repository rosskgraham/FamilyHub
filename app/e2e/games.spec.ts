import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { HEATING_URL, NOW } from '../playwright.config.ts';
import { wordFor } from '../src/lib/server/games/today.ts';
import { dayKey } from '../src/lib/time.ts';

// These run in order: they play the sample's games, which changes them. The sample starts with Ross solved in three,
// Maya in four, Leo two goes in and Sam not played.
test.describe.configure({ mode: 'serial' });

const answers = readFileSync(new URL('../src/lib/server/games/words/answers.txt', import.meta.url), 'utf8')
	.split(/\r?\n/)
	.filter(Boolean);
const ANSWER = wordFor(dayKey(new Date(NOW)), answers);
// Allowed words that aren't today's answer.
const MISSES = ['tiger', 'beach', 'plant', 'house', 'water', 'green', 'smile'].filter((w) => w !== ANSWER);

const has = (html: string, word: string) => new RegExp(`\\b${word}\\b`, 'i').test(html);

test.beforeEach(async ({ page }) => {
	// The time runs on from NOW, so the Hub can go back to Today when it's left alone.
	await page.clock.install({ time: new Date(NOW) });
	// Counts the chimes: each one makes an AudioContext.
	await page.addInitScript(() => {
		const w = window as unknown as { chimes: number; AudioContext: typeof AudioContext };
		w.chimes = 0;
		const Real = w.AudioContext;
		w.AudioContext = class extends Real {
			constructor() {
				super();
				w.chimes++;
			}
		};
	});
});

async function typeWord(page: Page, word: string) {
	const keys = page.getByRole('group', { name: 'Letters' });
	for (const letter of word) await keys.getByRole('button', { name: letter, exact: true }).click();
}

const check = (page: Page) => page.getByRole('button', { name: 'Check' }).click();
const card = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

test('the Games tab opens Word of the day, with a card for each Member', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Games' }).click();
	await expect(page).toHaveURL(/\/games$/);
	await expect(page.getByRole('link', { name: 'Games' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('listitem')).toHaveText([/Ross/, /Sam/, /Maya/, /Leo/]);
	await expect(card(page, 'Ross')).toContainText('Got it in 3');
	await expect(card(page, 'Sam')).toContainText('Not played yet');
	await expect(card(page, 'Leo')).toContainText('2 of 6 goes so far');
	// Streaks show from two days: Ross is only on his first.
	await expect(card(page, 'Maya')).toContainText('6 days in a row');
	await expect(card(page, 'Sam')).toContainText('3 days in a row');
	await expect(card(page, 'Leo')).toContainText('4 days in a row');
	await expect(card(page, 'Ross')).not.toContainText('in a row');
	await expect(page.getByRole('img', { name: 'Maya: Got it in 4' })).toBeVisible();

	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games.png');
	await page.goto('/games?theme=evening');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-evening.png');
});

test('no spoilers: the word isn’t sent to the screen until a game is finished', async ({ page, request }) => {
	for (const path of ['/games', '/games/leo', '/games/__data.json', '/games/leo/__data.json']) {
		const html = await (await request.get(path)).text();
		expect(has(html, ANSWER), path).toBe(false);
	}
	await page.goto('/games');
	await expect(card(page, 'Ross').getByRole('link')).toHaveCount(0);
});

test('a game carries on where it was left, and the keyboard shows the letters tried', async ({ page }) => {
	await page.goto('/games');
	await card(page, 'Leo')
		.getByRole('link', { name: /Carry on/ })
		.click();
	await expect(page).toHaveURL(/\/games\/leo$/);
	await expect(page.getByRole('link', { name: 'Games' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByText('Go 3 of 6')).toBeVisible();
	await expect(page.getByLabel('Go 1')).toHaveText(/^\s*s\s*t\s*o\s*r\s*m\s*$/i);

	await typeWord(page, 'pla');
	await expect(page.getByLabel('Go 3')).toHaveText(/^\s*p\s*l\s*a\s*$/i);
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-playing.png');
	await page.goto('/games/leo?theme=evening');
	await typeWord(page, 'pla');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-playing-evening.png');
});

test('typing fills the row, Delete takes a letter off, and a short or unknown word uses no go', async ({ page }) => {
	await page.goto('/games/leo');
	await typeWord(page, 'plan');
	await page.getByRole('button', { name: 'Delete a letter' }).click();
	await expect(page.getByLabel('Go 3')).toHaveText(/^\s*p\s*l\s*a\s*$/i);

	await check(page);
	await expect(page.getByRole('alert')).toHaveText('Five letters needed');

	await typeWord(page, 'zx');
	await check(page);
	await expect(page.getByRole('alert')).toHaveText('That isn’t a word the Hub knows');
	await expect(page.getByText('Go 3 of 6')).toBeVisible();

	await page.reload();
	await expect(page.getByText('Go 3 of 6')).toBeVisible();
	await expect(page.getByLabel('Go 3')).toHaveText(/^\s*$/);
});

test('solving the word ends the game, and the Games Section shows only its colours', async ({ page }) => {
	await page.goto('/games');
	await card(page, 'Sam').getByRole('link', { name: /Play/ }).click();
	await typeWord(page, MISSES[0]!);
	await check(page);
	await expect(page.getByText('Go 2 of 6')).toBeVisible();
	await typeWord(page, ANSWER);
	await check(page);

	// The celebration: the chime, Sam's goes and streak, and everyone's results, with no letters.
	const end = page.getByRole('alertdialog', { name: 'You got it, Sam!' });
	await expect(end).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { chimes: number }).chimes)).toBe(1);
	await expect(end).toContainText('In 2 goes. That’s 4 days in a row.');
	await expect(end.getByRole('list', { name: 'Everyone today' }).getByRole('listitem')).toHaveText([
		/^R\s*Got it in 3$/,
		/^S\s*Got it in 2$/,
		/^M\s*Got it in 4$/,
		/^L\s*2 of 6 goes so far$/
	]);
	expect(has(await end.innerHTML(), ANSWER)).toBe(false);
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-celebration.png');

	// It closes by itself, as the Chores celebration does, and hides the word again.
	await page.clock.fastForward('00:06');
	await expect(page).toHaveURL(/\/games$/);
	await expect(card(page, 'Sam')).toContainText('Got it in 2');
	await expect(card(page, 'Sam')).toContainText('4 days in a row');
	await expect(page.getByRole('img', { name: 'Sam: Got it in 2' })).toBeVisible();
	expect(has(await page.content(), ANSWER)).toBe(false);

	await page.goto('/games/sam');
	await expect(page).toHaveURL(/\/games$/);
});

test('Stop for now keeps the game', async ({ page }) => {
	await page.goto('/games/leo');
	await typeWord(page, MISSES[1]!);
	await check(page);
	await expect(page.getByText('Go 4 of 6')).toBeVisible();
	await page.getByRole('link', { name: 'Stop for now' }).click();
	await expect(page).toHaveURL(/\/games$/);
	await expect(card(page, 'Leo')).toContainText('3 of 6 goes so far');
});

test('the Hub going back to Today keeps the game', async ({ page }) => {
	await page.goto('/games/leo');
	await typeWord(page, MISSES[2]!);
	await check(page);
	await expect(page.getByText('Go 5 of 6')).toBeVisible();
	await page.clock.fastForward('01:50');
	await page.clock.fastForward('00:15');
	await expect(page).toHaveURL(/\/$/);
	await page.goto('/games');
	await expect(card(page, 'Leo')).toContainText('4 of 6 goes so far');
});

test('six goes without the word ends the game and shows the word', async ({ page }) => {
	await page.goto('/games/leo');
	for (const [i, word] of MISSES.slice(3, 5).entries()) {
		await typeWord(page, word);
		await check(page);
		await expect(page.getByText(`Go ${6 + i} of 6`).or(page.getByRole('alertdialog'))).toBeVisible();
	}
	// A kind ending: the word, and the streak carries on. No chime for a word not found.
	const end = page.getByRole('alertdialog', { name: `The word was ${ANSWER.toUpperCase()}` });
	await expect(end).toBeVisible();
	await expect(end).toContainText('Good try! Your streak carries on: 5 days in a row.');
	expect(await page.evaluate(() => (window as unknown as { chimes: number }).chimes)).toBe(0);
	await end.getByRole('button', { name: 'OK' }).click();
	await expect(card(page, 'Leo')).toContainText('Not this time');
	await expect(card(page, 'Leo')).toContainText('5 days in a row');
	expect(has(await page.content(), ANSWER)).toBe(false);
});

test('the celebration in the Evening theme, closed with Nice one!', async ({ page }) => {
	// The heating tests' Hub has its own sample games, where Sam hasn't played yet.
	await page.goto(`${HEATING_URL}/games/sam?theme=evening`);
	await typeWord(page, ANSWER);
	await check(page);
	const end = page.getByRole('alertdialog', { name: 'You got it, Sam!' });
	await expect(end).toContainText('In 1 go. That’s 4 days in a row.');
	// The heating tests change this Hub's target while they run, so the header's heating is hidden.
	await page.addStyleTag({ content: '.heating { visibility: hidden; }' });
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-celebration-evening.png');
	await end.getByRole('button', { name: 'Nice one!' }).click();
	await expect(page).toHaveURL(/\/games(\?theme=evening)?$/);
	await expect(card(page, 'Sam')).toContainText('Got it in 1');
});

// Number of the day (AB#91). On the sample's day the draw is 100, 50, 8, 4, 3 and 3, with 424 to reach. Maya got it,
// Ross finished on 108, 316 away, Leo is two steps in (3 + 3 and 100 + 50) and Sam hasn't played.
const numbers = (page: Page) => page.getByRole('group', { name: 'Numbers left' });
// The nth tile with that number, as a number can be there twice.
const tapNumber = (page: Page, n: number, nth = 0) =>
	numbers(page)
		.getByRole('button', { name: String(n), exact: true })
		.nth(nth)
		.click();
const tapSign = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const steps = (page: Page) => page.getByRole('list', { name: 'Steps so far' }).getByRole('listitem');

async function step(page: Page, a: number, sign: string, b: number) {
	await tapNumber(page, a);
	await tapSign(page, sign);
	await tapNumber(page, b);
}

test('Number of the day: choosing it shows its cards, and the Games tab opens on it', async ({ page }) => {
	await page.goto('/games');
	await expect(page).toHaveURL(/\/games$/);
	await page.getByRole('link', { name: /^Number of the day/ }).click();
	await expect(page).toHaveURL(/\/games\/numbers$/);
	await expect(page.getByRole('link', { name: /^Number of the day/ })).toHaveAttribute('aria-current', 'true');
	await expect(page.getByRole('link', { name: 'Games', exact: true })).toHaveAttribute('aria-current', 'page');

	await expect(page.getByRole('listitem')).toHaveText([/Ross/, /Sam/, /Maya/, /Leo/]);
	await expect(card(page, 'Maya')).toContainText('Got it');
	await expect(card(page, 'Ross')).toContainText('316 away');
	await expect(card(page, 'Leo')).toContainText('2 steps so far');
	await expect(card(page, 'Sam')).toContainText('Not played yet');
	// Number of the day's own streaks (AB#92): Ross is only on his first.
	await expect(card(page, 'Maya')).toContainText('3 days in a row');
	await expect(card(page, 'Leo')).toContainText('5 days in a row');
	await expect(card(page, 'Sam')).toContainText('3 days in a row');
	await expect(card(page, 'Ross')).not.toContainText('in a row');
	// A finished game can't be opened, and its card shows only how close it got.
	await expect(card(page, 'Maya').getByRole('link')).toHaveCount(0);
	await expect(card(page, 'Ross')).not.toContainText('108');

	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-numbers.png');
	await page.goto('/games/numbers?theme=evening');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-numbers-evening.png');

	// The Games tab now opens on Number of the day, until Word of the day is chosen again.
	await page.goto('/');
	await page.getByRole('link', { name: 'Games', exact: true }).click();
	await expect(page).toHaveURL(/\/games\/numbers$/);
	await page.getByRole('link', { name: /^Word of the day/ }).click();
	await expect(page).toHaveURL(/\/games\?game=word$/);
	await expect(card(page, 'Ross')).toContainText('Got it in 3');
	await page.goto('/');
	await page.getByRole('link', { name: 'Games', exact: true }).click();
	await expect(page).toHaveURL(/\/games$/);
});

// A page's own data from SvelteKit's __data.json, where values point to each other by their place in one array.
function pageData(body: { nodes: { data?: unknown[] }[] }): unknown {
	const data = body.nodes.at(-1)!.data!;
	const at = (i: number): unknown => {
		if (i < 0) return undefined;
		const value = data[i];
		if (Array.isArray(value)) return value.map(at);
		if (value && typeof value === 'object')
			return Object.fromEntries(Object.entries(value).map(([key, j]) => [key, at(j as number)]));
		return value;
	};
	return at(0);
}

test('Number of the day: no way to reach the target is sent before a game is finished', async ({ request }) => {
	// The solver's way is 50 + 3 = 53, then 53 × 8, and nobody still playing has made 53 themselves.
	for (const path of [
		'/games/numbers/__data.json',
		'/games/numbers/leo/__data.json',
		'/games/numbers/sam/__data.json'
	]) {
		const data = JSON.stringify(pageData(await (await request.get(path)).json()));
		expect(data, path).not.toMatch(/\b53\b/);
		expect(data, path).not.toMatch(/"(solution|way)"/i);
	}
	const leo = JSON.stringify(pageData(await (await request.get('/games/numbers/leo/__data.json')).json()));
	expect(leo).toContain('"numbers":[8,4,6,150]');
});

test('Number of the day: steps, refused steps, Undo and Start again', async ({ page }) => {
	await page.goto('/games/numbers');
	await card(page, 'Sam').getByRole('link', { name: /Play/ }).click();
	await expect(page).toHaveURL(/\/games\/numbers\/sam$/);
	await expect(page.getByLabel('Target', { exact: true })).toHaveText('424');
	await expect(numbers(page).getByRole('button')).toHaveText(['100', '50', '8', '4', '3', '3']);
	await expect(page.getByText('Closest so far: 100, which is 324 away')).toBeVisible();

	// Every tap target is at least as big as Word of the day's keys, 100 by 104.
	for (const button of await page.locator('.numbers button, .buttons button').all()) {
		const box = (await button.boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(100);
		expect(box.height).toBeGreaterThanOrEqual(104);
	}

	await step(page, 50, 'Add', 3);
	await expect(steps(page)).toHaveText(['50 + 3 = 53']);
	await expect(numbers(page).getByRole('button')).toHaveText(['100', '8', '4', '3', '53']);
	await expect(page.getByText('1 step so far')).toBeVisible();

	// Tapping a chosen number again puts it down.
	await tapNumber(page, 53);
	await expect(numbers(page).getByRole('button', { name: '53' })).toHaveAttribute('aria-pressed', 'true');
	await tapNumber(page, 53);
	await expect(numbers(page).getByRole('button', { name: '53' })).toHaveAttribute('aria-pressed', 'false');

	await step(page, 3, 'Take away', 8);
	await expect(page.getByRole('alert')).toHaveText('That would be less than nothing');
	await step(page, 8, 'Divide', 3);
	await expect(page.getByRole('alert')).toHaveText('That gives a fraction');
	await expect(numbers(page).getByRole('button')).toHaveText(['100', '8', '4', '3', '53']);

	await tapNumber(page, 53);
	await tapSign(page, 'Times');
	await expect(page.getByRole('alert')).toHaveText('Now tap a number');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-numbers-playing.png');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(steps(page)).toHaveCount(0);
	await expect(numbers(page).getByRole('button')).toHaveText(['100', '50', '8', '4', '3', '3']);
	await tapNumber(page, 3);
	await tapSign(page, 'Take away');
	await tapNumber(page, 3, 1);
	await expect(page.getByRole('alert')).toHaveText('That gives zero');

	await step(page, 100, 'Add', 8);
	await step(page, 108, 'Times', 4);
	await expect(steps(page)).toHaveText(['100 + 8 = 108', '108 × 4 = 432']);
	await page.getByRole('button', { name: 'Start again' }).click();
	await expect(steps(page)).toHaveCount(0);
	await expect(numbers(page).getByRole('button')).toHaveText(['100', '50', '8', '4', '3', '3']);

	await page.goto('/games/numbers/sam?theme=evening');
	await tapNumber(page, 100);
	await tapSign(page, 'Add');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-numbers-playing-evening.png');
});

test('Number of the day: Stop for now keeps the steps, and Finish with… ends it so many away', async ({ page }) => {
	await page.goto('/games/numbers/sam');
	await expect(page.getByText('No steps yet · 3 days in a row')).toBeVisible();
	await step(page, 100, 'Times', 4);
	await expect(steps(page)).toHaveText(['100 × 4 = 400']);
	await page.getByRole('link', { name: 'Stop for now' }).click();
	await expect(page).toHaveURL(/\/games\/numbers$/);
	await expect(card(page, 'Sam')).toContainText('1 step so far');

	// The steps come back from the Hub's database, not the page.
	await page.reload();
	await card(page, 'Sam')
		.getByRole('link', { name: /Carry on/ })
		.click();
	await expect(steps(page)).toHaveText(['100 × 4 = 400']);

	await page.getByRole('button', { name: 'Finish with…' }).click();
	await expect(page.getByRole('alert')).toHaveText('Which number are you finishing with?');
	await tapNumber(page, 400);

	// The quieter ending (AB#92): no chime or stars, how close it was, one way to do it, and everyone's results.
	const end = page.getByRole('alertdialog', { name: 'So close, Sam!' });
	await expect(end).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { chimes: number }).chimes)).toBe(0);
	await expect(end).toContainText('Finished with 400, 24 away. That’s 4 days in a row.');
	await expect(end.getByRole('list', { name: 'Your steps' }).getByRole('listitem')).toHaveText([
		'100 × 4 = 400',
		'Finished with 400'
	]);
	await expect(end.getByRole('list', { name: 'One way to do it' }).getByRole('listitem')).toHaveText([
		'50 + 3 = 53',
		'53 × 8 = 424'
	]);
	await expect(end.getByRole('list', { name: 'Everyone today' }).getByRole('listitem')).toHaveText([
		/^R\s*316 away$/,
		/^S\s*24 away$/,
		/^M\s*Got it$/,
		/^L\s*Not yet$/
	]);
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-numbers-close.png');

	// It closes by itself, and the way to do it goes with it.
	await page.clock.fastForward('00:12');
	await expect(page).toHaveURL(/\/games\/numbers$/);
	await expect(card(page, 'Sam')).toContainText('24 away');
	await expect(card(page, 'Sam')).toContainText('4 days in a row');
	await expect(card(page, 'Sam').getByRole('link')).toHaveCount(0);
	expect(await page.content()).not.toContain('53 × 8');

	// A finished game can't be played again that day.
	await page.goto('/games/numbers/sam');
	await expect(page).toHaveURL(/\/games\/numbers$/);
});

test('Number of the day: making the target ends the game with a celebration', async ({ page }) => {
	await page.goto('/games/numbers/leo');
	await expect(page.getByText('2 steps so far · 5 days in a row')).toBeVisible();
	await expect(steps(page)).toHaveText(['3 + 3 = 6', '100 + 50 = 150']);
	await page.getByRole('button', { name: 'Start again' }).click();
	await step(page, 50, 'Add', 3);
	await step(page, 53, 'Times', 8);

	const end = page.getByRole('alertdialog', { name: 'You got it, Leo!' });
	await expect(end).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { chimes: number }).chimes)).toBe(1);
	await expect(end).toContainText('424 in 2 steps. That’s 6 days in a row.');
	await expect(end.getByRole('list', { name: 'Your steps' }).getByRole('listitem')).toHaveText([
		'50 + 3 = 53',
		'53 × 8 = 424'
	]);
	await expect(end.getByRole('list', { name: 'One way to do it' }).getByRole('listitem')).toHaveCount(2);
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-numbers-celebration.png');

	await end.getByRole('button', { name: 'Nice one!' }).click();
	await expect(page).toHaveURL(/\/games\/numbers$/);
	await expect(card(page, 'Leo')).toContainText('Got it');
	await expect(card(page, 'Leo')).toContainText('6 days in a row');
	await expect(card(page, 'Leo').getByRole('link')).toHaveCount(0);
	expect(await page.content()).not.toContain('53 × 8');
});

test('Number of the day: the celebration in the Evening theme', async ({ page }) => {
	// The heating tests' Hub has its own sample games, where Sam hasn't played Number of the day yet.
	await page.goto(`${HEATING_URL}/games/numbers/sam?theme=evening`);
	await step(page, 50, 'Add', 3);
	await step(page, 53, 'Times', 8);
	await expect(page.getByRole('alertdialog', { name: 'You got it, Sam!' })).toBeVisible();
	// The heating tests change this Hub's target while they run, so the header's heating is hidden.
	await page.addStyleTag({ content: '.heating { visibility: hidden; }' });
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('games-numbers-celebration-evening.png');
});
