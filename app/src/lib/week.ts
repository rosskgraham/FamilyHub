import { addDays, type DayKey } from './time.ts';

// `?week=1` is the 7 days after the next 7, `?week=-1` the 7 before today, up to a year either way.
const MAX_WEEKS = 52;

/** The Week view's page: a rolling 7 days, today first, stepped a week at a time by `?week=`. */
export function weekPage(today: DayKey, week: string | null): { offset: number; days: DayKey[] } {
	const requested = Number.parseInt(week ?? '0', 10);
	const offset = Number.isNaN(requested) ? 0 : Math.max(-MAX_WEEKS, Math.min(MAX_WEEKS, requested));
	const first = addDays(today, offset * 7);
	return { offset, days: Array.from({ length: 7 }, (_, i) => addDays(first, i)) };
}

/** "Next 7 days", or how far it's been stepped from them: "In 1 week", "2 weeks ago". */
export function weekTitle(offset: number): string {
	if (offset === 0) return 'Next 7 days';
	const weeks = Math.abs(offset) === 1 ? '1 week' : `${Math.abs(offset)} weeks`;
	return offset > 0 ? `In ${weeks}` : `${weeks} ago`;
}
