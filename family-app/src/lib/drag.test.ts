import { describe, expect, it } from 'vitest';
import { dropIndex, makesRoom, rowsBefore, SCROLL_EDGE, SCROLL_MOST, scrollSpeed } from './drag.ts';

// Rows 60 px tall, their middles at 30, 90, 150, 210, 270.
const middles = [30, 90, 150, 210, 270];

describe('dragging by the handle', () => {
	it('lands where it is let go, among the other rows', () => {
		// The second row, dragged down past the third and fourth rows' middles.
		expect(dropIndex(middles, 1, 90 + 125)).toBe(3);
		// Up above the first row's middle.
		expect(dropIndex(middles, 3, 210 - 190)).toBe(0);
		// To the bottom, past everything.
		expect(dropIndex(middles, 0, 400)).toBe(4);
	});

	it('stays put when it has not passed another row’s middle', () => {
		expect(dropIndex(middles, 2, 150 + 50)).toBe(2);
		expect(dropIndex(middles, 2, 150 - 50)).toBe(2);
	});

	it('moves the rows it passes up or down a row to make room', () => {
		// Dragged down from 1 to 3: rows 2 and 3 move up.
		expect([0, 1, 2, 3, 4].map((index) => makesRoom(index, 1, 3))).toEqual([0, 0, -1, -1, 0]);
		// Dragged up from 3 to 0: rows 0 to 2 move down.
		expect([0, 1, 2, 3, 4].map((index) => makesRoom(index, 3, 0))).toEqual([1, 1, 1, 0, 0]);
		// Not moved: nothing makes room.
		expect([0, 1, 2].map((index) => makesRoom(index, 1, 1))).toEqual([0, 0, 0]);
	});

	it('scrolls the list near its top or bottom edge, faster nearer the edge', () => {
		expect(scrollSpeed(300, 100, 700)).toBe(0);
		expect(scrollSpeed(100, 100, 700)).toBe(-SCROLL_MOST);
		expect(scrollSpeed(100 + SCROLL_EDGE / 2, 100, 700)).toBe(-SCROLL_MOST / 2);
		expect(scrollSpeed(700, 100, 700)).toBe(SCROLL_MOST);
		expect(scrollSpeed(750, 100, 700)).toBe(SCROLL_MOST);
	});
});

describe('dragging across the divider into the Shop’s order (AB#87)', () => {
	// Plasters, not placed yet (middle 30); the "In Aldi order" divider (middle 75, 30 px tall); then Bananas (120)
	// and Milk (180), in Aldi's order.
	const parts = [30, 75, 120, 180];
	const rows = [true, false, true, true];

	it('drops the last unplaced item just below the divider as first in the order, a move', () => {
		// Plasters dragged down 60 px: past the divider's middle, not Bananas'.
		const to = dropIndex(parts, 0, 30 + 60);

		expect(to).toBe(1);
		expect(to).not.toBe(0);
		// Among the other rows, it lands before Bananas: first in Aldi's order.
		expect(rowsBefore(rows, 0, to)).toBe(0);
	});

	it('is no move when it is let go above the divider, where it started', () => {
		expect(dropIndex(parts, 0, 30 + 30)).toBe(0);
	});

	it('lands among the rows as before further down', () => {
		// Past Bananas' middle: after Bananas.
		const to = dropIndex(parts, 0, 30 + 100);
		expect(rowsBefore(rows, 0, to)).toBe(1);
		// Milk dragged up above the divider, among the items not placed yet: before Bananas, after Plasters.
		expect(rowsBefore(rows, 3, dropIndex(parts, 3, 50))).toBe(1);
	});

	it('carries the divider along with the rows making room, so nothing covers it', () => {
		// Plasters dragged down past Bananas: the divider and Bananas both move up a row.
		expect(parts.map((_, index) => makesRoom(index, 0, 2))).toEqual([0, -1, -1, 0]);
	});
});
