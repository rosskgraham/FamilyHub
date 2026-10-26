import type { CalendarEvent, DayEvents } from './calendar.ts';

// How a day's Events fit a column of fixed height. Rows have fixed heights,
// so what fits is decided by arithmetic, never by measuring the page, and
// the page never jumps about as it draws. Nothing is ever silently dropped:
// what doesn't fit is counted in `more`, which opens the Day view.

export interface Space {
	/** Height available for rows, in px. */
	height: number;
	/** Gap before each row, in px. */
	gap: number;
	/** Height of a full card, or undefined if the column only ever uses rows. */
	card?: number;
	/** Height of a one-line row, which is also the height of the "earlier" and "more" lines. */
	row: number;
}

export interface ColumnFit {
	/** True when Events are drawn as one-line rows instead of full cards. */
	compact: boolean;
	allDay: CalendarEvent[];
	/** How many finished Events fold into one "N earlier" line. */
	earlier: number;
	timed: CalendarEvent[];
	/** How many Events didn't fit, behind a "+N more" line. */
	more: number;
}

const cost = (rows: number, height: number, space: Space) => rows * (height + space.gap);

export function fitColumn({ allDay, timed }: DayEvents, space: Space, now?: Date): ColumnFit {
	// 1. Full cards, if they all fit.
	if (space.card !== undefined && cost(allDay.length, space.row, space) + cost(timed.length, space.card, space) <= space.height) {
		return { compact: false, allDay, earlier: 0, timed, more: 0 };
	}

	// 2. One-line rows, if they all fit.
	if (cost(allDay.length + timed.length, space.row, space) <= space.height) {
		return { compact: true, allDay, earlier: 0, timed, more: 0 };
	}

	// 3. Fold finished Events into one "earlier" line (today only).
	const ended = now ? timed.filter((e) => new Date(e.end) <= now) : [];
	const rest = timed.filter((e) => !ended.includes(e));
	const earlierRows = ended.length > 0 ? 1 : 0;
	if (cost(allDay.length + earlierRows + rest.length, space.row, space) <= space.height) {
		return { compact: true, allDay, earlier: ended.length, timed: rest, more: 0 };
	}

	// 4. Show what fits, and count the rest behind "+N more".
	const capacity = Math.floor(space.height / (space.row + space.gap));
	const shown = Math.max(0, capacity - earlierRows - 1);
	const items = [...allDay, ...rest];
	const kept = new Set(items.slice(0, shown));
	return {
		compact: true,
		allDay: allDay.filter((e) => kept.has(e)),
		earlier: ended.length,
		timed: rest.filter((e) => kept.has(e)),
		more: items.length - kept.size
	};
}
