// Swipe an item either way to remove it (AB#79, design/mockups/family-app screen J). The row follows the finger,
// with a red Remove band behind it; let go past a third of its width, or flick, and it goes, with the list's Undo.
// Let go short of that and it slides back. Both directions remove until there's a second use for a swipe (Ross,
// 2026-11-24). The row has touch-action: pan-y, so a vertical drag stays the browser's, for scrolling.

/** How far the finger moves before it's decided whether it's a swipe or a scroll, in pixels. */
export const DECIDE_AFTER = 10;
/** How much of the row's width a swipe must cover to remove it, when let go. */
export const REMOVE_PAST = 1 / 3;
/** A flick: at least this fast, in pixels a millisecond, and this far. */
export const FLICK_SPEED = 0.5;
export const FLICK_DISTANCE = 40;
/** How long the row takes to slide off or back, in milliseconds. */
export const SLIDE_MS = 160;

/** Whether a move so far is a swipe, a scroll, or too small to tell. */
export function direction(dx: number, dy: number): 'sideways' | 'vertical' | null {
	if (Math.hypot(dx, dy) < DECIDE_AFTER) return null;
	return Math.abs(dx) > Math.abs(dy) ? 'sideways' : 'vertical';
}

/** Whether letting go of a swipe removes the item: far enough, or a flick the same way it moved. */
export function removes(dx: number, width: number, speed: number): boolean {
	if (Math.abs(dx) >= width * REMOVE_PAST) return true;
	return Math.abs(dx) >= FLICK_DISTANCE && Math.abs(speed) >= FLICK_SPEED && Math.sign(speed) === Math.sign(dx);
}

/**
 * Makes a row swipeable: the element marked [data-slide] inside it follows the finger, and the row gets
 * data-swiping while it moves, for the band behind to show. A click straight after a swipe is swallowed, so it
 * doesn't tick or edit the item.
 */
export function swipeable(onremove: () => void) {
	return (row: HTMLElement) => {
		const slide = row.querySelector<HTMLElement>('[data-slide]') ?? row;
		let start: { x: number; y: number; id: number } | null = null;
		let sideways = false;
		let swiped = false;
		// The last few positions, for the speed when let go.
		let trail: { x: number; t: number }[] = [];

		const place = (dx: number, animate: boolean) => {
			slide.style.transition = animate ? `transform ${SLIDE_MS}ms ease-out` : '';
			slide.style.transform = dx ? `translateX(${dx}px)` : '';
		};

		const down = (event: PointerEvent) => {
			if (event.button !== 0 || start) return;
			start = { x: event.clientX, y: event.clientY, id: event.pointerId };
			sideways = false;
			// A browser may send no click after a swipe, so this mustn't swallow the next real tap.
			swiped = false;
			trail = [{ x: event.clientX, t: event.timeStamp }];
		};

		const move = (event: PointerEvent) => {
			if (!start || event.pointerId !== start.id) return;
			const dx = event.clientX - start.x;
			if (!sideways) {
				const seen = direction(dx, event.clientY - start.y);
				if (seen === 'vertical') return void (start = null);
				if (seen !== 'sideways') return;
				sideways = true;
				row.setPointerCapture(event.pointerId);
				row.dataset.swiping = '';
			}
			trail = [...trail.slice(-4), { x: event.clientX, t: event.timeStamp }];
			row.dataset.side = dx > 0 ? 'right' : 'left';
			place(dx, false);
		};

		const up = (event: PointerEvent) => {
			if (!start || event.pointerId !== start.id) return;
			const dx = event.clientX - start.x;
			start = null;
			if (!sideways) return;
			swiped = true;
			const first = trail[0]!;
			const elapsed = event.timeStamp - first.t;
			const speed = elapsed > 0 ? (event.clientX - first.x) / elapsed : 0;
			if (removes(dx, row.clientWidth, speed)) {
				place(Math.sign(dx) * row.clientWidth, true);
				setTimeout(onremove, SLIDE_MS);
			} else {
				place(0, true);
				setTimeout(() => delete row.dataset.swiping, SLIDE_MS);
			}
		};

		const cancel = () => {
			if (sideways) {
				place(0, true);
				setTimeout(() => delete row.dataset.swiping, SLIDE_MS);
			}
			start = null;
			sideways = false;
		};

		const click = (event: MouseEvent) => {
			if (!swiped) return;
			swiped = false;
			event.stopPropagation();
			event.preventDefault();
		};

		row.addEventListener('pointerdown', down);
		row.addEventListener('pointermove', move);
		row.addEventListener('pointerup', up);
		row.addEventListener('pointercancel', cancel);
		row.addEventListener('click', click, true);
		return () => {
			row.removeEventListener('pointerdown', down);
			row.removeEventListener('pointermove', move);
			row.removeEventListener('pointerup', up);
			row.removeEventListener('pointercancel', cancel);
			row.removeEventListener('click', click, true);
		};
	};
}
