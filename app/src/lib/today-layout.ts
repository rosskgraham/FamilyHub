// How the Today view shares its height between the all-day banner, Later today and Coming up. Heights are fixed, so
// what fits is worked out rather than measured. When Later today's rows would leave Coming up too little room to show
// anything but "+N more", they're drawn slimmer.

export const MAIN = 744; // the stage between the header and the bottom bar
export const NEXT = 168;
export const BANNER = 56;
export const SECTION_GAP = 16;
export const HEADING = 34;
export const HEADING_GAP = 10;
export const LATER_ROW = 76;
export const LATER_SLIM = 52;
export const LATER_GAP = 10;
export const LATER_MAX = 3;
export const DAY_PADDING = 14;
export const DAY_HEAD = 34;
export const CHIP = 38;
export const CHIP_GAP = 8;
/** Coming up should show at least this many rows a day before Later today gives up height for it. */
export const COMING_ROWS = 2;

export interface TodayLayout {
	/** The height of each Later today row. */
	laterRow: number;
	/** The height left for each Coming up day's rows. */
	comingHeight: number;
}

/** The layout for a day with or without all-day Events, and with `laterRows` rows of Later today. */
export function todayLayout(hasAllDay: boolean, laterRows: number): TodayLayout {
	const comingFor = (row: number) =>
		MAIN -
		NEXT -
		SECTION_GAP -
		(hasAllDay ? BANNER + SECTION_GAP : 0) -
		(laterRows > 0 ? HEADING + HEADING_GAP + laterRows * row + (laterRows - 1) * LATER_GAP + SECTION_GAP : 0) -
		HEADING -
		HEADING_GAP -
		2 * DAY_PADDING -
		DAY_HEAD;
	const roomy = comingFor(LATER_ROW) >= COMING_ROWS * (CHIP + CHIP_GAP);
	const laterRow = roomy ? LATER_ROW : LATER_SLIM;
	return { laterRow, comingHeight: comingFor(laterRow) };
}
