import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { NOW } from '../playwright.config.ts';
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

	const end = page.getByRole('alertdialog', { name: 'You got it, Sam!' });
	await expect(end).toBeVisible();
	await end.getByRole('button', { name: 'Back to Games' }).click();
	await expect(page).toHaveURL(/\/games$/);
	await expect(card(page, 'Sam')).toContainText('Got it in 2');
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
	const end = page.getByRole('alertdialog', { name: `The word was ${ANSWER.toUpperCase()}` });
	await expect(end).toBeVisible();
	await end.getByRole('button', { name: 'Back to Games' }).click();
	await expect(card(page, 'Leo')).toContainText('Not this time');
	expect(has(await page.content(), ANSWER)).toBe(false);
});
