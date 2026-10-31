// After about two minutes untouched, the Hub goes back to the Today view.

export const IDLE_MS = 2 * 60_000;

/** Whether to go back to the Today view. Never from setup, which takes longer than that. */
export function returnsToToday(path: string, now: Date, lastTouch: Date): boolean {
	if (path === '/' || path.startsWith('/setup') || path.startsWith('/auth')) return false;
	return now.getTime() - lastTouch.getTime() >= IDLE_MS;
}
