// After about two minutes untouched, the Hub goes back to the Today view.

export const IDLE_MS = 2 * 60_000;

/** Whether to go back to the Today view. Never from setup, which takes longer than that. */
export function returnsToToday(path: string, now: Date, lastTouch: Date): boolean {
	if (path === '/' || path.startsWith('/setup') || path.startsWith('/auth')) return false;
	return now.getTime() - lastTouch.getTime() >= IDLE_MS;
}

/**
 * Whether to reload for a new release. The screen's browser runs for days, so without this it keeps the code it
 * opened with, and new data reaches old components. It waits until the Hub's been left alone, so a reload never
 * interrupts someone, and never reloads setup.
 */
export function reloadsForRelease(updated: boolean, path: string, now: Date, lastTouch: Date): boolean {
	if (!updated || path.startsWith('/setup') || path.startsWith('/auth')) return false;
	return now.getTime() - lastTouch.getTime() >= IDLE_MS;
}
