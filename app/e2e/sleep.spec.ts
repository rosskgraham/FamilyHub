import { expect, test } from '@playwright/test';

// 23:00 on Wednesday 28 October, in Sleep hours. The server's Events are for the same days.
const NIGHT = new Date('2026-10-28T23:00:00Z');

test('overnight the Hub sleeps, showing the time and the next Event', async ({ page }) => {
	await page.clock.setFixedTime(NIGHT);
	await page.goto('/');
	const sleep = page.getByRole('button', { name: 'Wake the Hub' });
	await expect(sleep).toContainText('23:00');
	await expect(sleep).toContainText('Swimming · 17:00');
	await expect(sleep).toContainText('tomorrow');
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot('sleep.png');
});

test('a tap wakes it without pressing anything, and two minutes untouched sends it back', async ({ page }) => {
	await page.clock.install({ time: NIGHT });
	await page.goto('/week');
	const sleep = page.getByRole('button', { name: 'Wake the Hub' });

	// The middle of the screen, over a day in the Week view.
	await sleep.click();
	await expect(sleep).toBeHidden();
	await expect(page).toHaveURL(/\/week$/);
	await expect(page.getByText('This week')).toBeVisible();

	await page.clock.fastForward('01:50');
	await expect(sleep).toBeHidden();
	await page.clock.fastForward('00:15');
	await expect(sleep).toBeVisible();
});
