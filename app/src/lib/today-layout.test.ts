import { describe, expect, it } from 'vitest';
import { fitColumn } from './fit.ts';
import { CHIP, CHIP_GAP, COMING_ROWS, LATER_ROW, LATER_SLIM, todayLayout } from './today-layout.ts';

/** How many rows a Coming up day can show. */
const comingRows = (height: number) => Math.floor(height / (CHIP + CHIP_GAP));

describe('todayLayout', () => {
	it.each([
		['a quiet day', false, 0],
		['a few things later', false, 2],
		['an all-day Event and two things later', true, 2],
		['three things later and no all-day Event', false, 3]
	])('keeps full-height Later today rows on %s', (_, hasAllDay, laterRows) => {
		const layout = todayLayout(hasAllDay, laterRows);
		expect(layout.laterRow).toBe(LATER_ROW);
		expect(comingRows(layout.comingHeight)).toBeGreaterThanOrEqual(COMING_ROWS);
	});

	it('slims Later today when a birthday and three things later would leave Coming up only “+N more”', () => {
		expect(comingRows(todayLayout(true, 3).comingHeight)).toBeGreaterThanOrEqual(COMING_ROWS);
		expect(todayLayout(true, 3).laterRow).toBe(LATER_SLIM);
	});

	it('then shows a busy day’s first Event in Coming up, not only “+N more”', () => {
		const event = (i: number) => ({ id: `e${i}`, title: 'x', owner: 'alex', allDay: false, start: '', end: '' });
		const busy = { allDay: [], timed: [1, 2, 3, 4, 5].map(event) };
		const fit = fitColumn(busy, { height: todayLayout(true, 3).comingHeight, gap: CHIP_GAP, row: CHIP });
		expect(fit.timed.length).toBeGreaterThanOrEqual(1);
	});
});
