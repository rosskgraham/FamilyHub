import { describe, expect, it } from 'vitest';
import { dropIndex, makesRoom, SCROLL_EDGE, SCROLL_MOST, scrollSpeed } from './drag.ts';

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
