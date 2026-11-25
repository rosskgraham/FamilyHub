// Drag an item by its handle to put it where it is in the shop (AB#86, design/mockups/family-app screen M). Only
// the handle drags, so the row still swipes to remove and the words still edit. The item lifts and follows the
// finger, the items it passes make room, and letting go places it there. Near the top or bottom of the list, the
// list scrolls.
//
// The divider into a Shop's walking order ("In Aldi order", marked [data-drag-divider]) takes part like a row
// (AB#87): rows making room carry it along rather than cover it, and dropping an item just below it is a move,
// which is how the last item not placed yet goes first in the Shop's order.

/** How close to the list's top or bottom edge, in pixels, the finger makes it scroll. */
export const SCROLL_EDGE = 56;
/** The most the list scrolls each frame, in pixels. */
export const SCROLL_MOST = 12;

/**
 * Where a dragged row lands, as its position among the other parts of the list (rows and the divider): how many
 * of them have their middle above the dragged row's middle. middles are the parts' middles before the drag, the
 * dragged row's included at from.
 */
export function dropIndex(middles: number[], from: number, middle: number): number {
	return middles.filter((other, index) => index !== from && other < middle).length;
}

/** How far the parts between where it was and where it lands move to make room: up or down a row, or not at all. */
export function makesRoom(index: number, from: number, to: number): -1 | 0 | 1 {
	if (from < to && index > from && index <= to) return -1;
	if (to < from && index >= to && index < from) return 1;
	return 0;
}

/**
 * Where a row dropped at position to among the other parts lands among the other rows: how many of the parts
 * before it are rows, not the divider. rows says which parts are rows, the dragged one's included at from.
 */
export function rowsBefore(rows: boolean[], from: number, to: number): number {
	return rows
		.filter((_, index) => index !== from)
		.slice(0, to)
		.filter(Boolean).length;
}

/** How fast to scroll with the finger at y, in a list spanning top to bottom: negative is up. */
export function scrollSpeed(y: number, top: number, bottom: number): number {
	if (y < top + SCROLL_EDGE) return -Math.ceil(SCROLL_MOST * Math.min(1, (top + SCROLL_EDGE - y) / SCROLL_EDGE));
	if (y > bottom - SCROLL_EDGE) return Math.ceil(SCROLL_MOST * Math.min(1, (y - (bottom - SCROLL_EDGE)) / SCROLL_EDGE));
	return 0;
}

/**
 * Makes a handle drag its row. The rows that can be dragged among are the list's elements marked
 * [data-drag-row], in order, with the divider marked [data-drag-divider] among them; ondrop gets where the row
 * lands among the other rows. A drop where it started, on the same side of the divider, sends nothing.
 */
export function draggable(ondrop: (to: number) => void) {
	return (handle: HTMLElement) => {
		let drag: {
			id: number;
			row: HTMLElement;
			parts: HTMLElement[];
			list: HTMLElement;
			from: number;
			to: number;
			middles: number[];
			height: number;
			startY: number;
			startScroll: number;
			y: number;
			frame: number;
		} | null = null;

		const position = () => {
			if (!drag) return;
			const { row, parts, list, from, middles, height, startY, startScroll, y } = drag;
			const dy = y + list.scrollTop - (startY + startScroll);
			row.style.transform = `translateY(${dy}px) scale(1.03)`;
			drag.to = dropIndex(middles, from, middles[from]! + dy);
			parts.forEach((other, index) => {
				if (index === from) return;
				const room = makesRoom(index, from, drag!.to);
				other.style.transform = room ? `translateY(${room * height}px)` : '';
			});
		};

		const scroll = () => {
			if (!drag) return;
			const { top, bottom } = drag.list.getBoundingClientRect();
			const speed = scrollSpeed(drag.y, top, bottom);
			if (speed) {
				drag.list.scrollTop += speed;
				position();
			}
			drag.frame = requestAnimationFrame(scroll);
		};

		const end = (place: boolean) => {
			if (!drag) return;
			const { row, parts, list, to, from, frame } = drag;
			cancelAnimationFrame(frame);
			drag = null;
			for (const other of parts) {
				other.style.transform = '';
				other.style.transition = '';
			}
			delete row.dataset.dragging;
			delete list.dataset.dragging;
			const rows = parts.map((part) => part.dataset.dragRow !== undefined);
			if (place && to !== from) ondrop(rowsBefore(rows, from, to));
		};

		const down = (event: PointerEvent) => {
			if (event.button !== 0 || drag) return;
			const row = handle.closest<HTMLElement>('[data-drag-row]');
			const list = row?.parentElement;
			if (!row || !list) return;
			// The row's own swipe mustn't start, nor the page scroll.
			event.stopPropagation();
			event.preventDefault();
			const parts = [...list.querySelectorAll<HTMLElement>(':scope > [data-drag-row], :scope > [data-drag-divider]')];
			const middles = parts.map((other) => {
				const rect = other.getBoundingClientRect();
				return rect.top + rect.height / 2;
			});
			drag = {
				id: event.pointerId,
				row,
				parts,
				list,
				from: parts.indexOf(row),
				to: parts.indexOf(row),
				middles,
				height: row.getBoundingClientRect().height,
				startY: event.clientY,
				startScroll: list.scrollTop,
				y: event.clientY,
				frame: 0
			};
			handle.setPointerCapture(event.pointerId);
			row.dataset.dragging = '';
			list.dataset.dragging = '';
			for (const other of parts) if (other !== row) other.style.transition = 'transform 0.15s ease-out';
			drag.frame = requestAnimationFrame(scroll);
		};

		const move = (event: PointerEvent) => {
			if (!drag || event.pointerId !== drag.id) return;
			event.preventDefault();
			drag.y = event.clientY;
			position();
		};

		const up = (event: PointerEvent) => {
			if (drag && event.pointerId === drag.id) end(true);
		};
		const cancel = () => end(false);

		handle.addEventListener('pointerdown', down);
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
		handle.addEventListener('pointercancel', cancel);
		return () => {
			end(false);
			handle.removeEventListener('pointerdown', down);
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', up);
			handle.removeEventListener('pointercancel', cancel);
		};
	};
}
