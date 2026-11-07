import type { ShoppingItem } from '#lib/shopping.ts';
import { TICKED_MS, type GoogleTask } from '../tasks/google.ts';

/**
 * Items still to get, in the list's order, then items ticked off in the last few minutes.
 * Deleted tasks, subtasks, blank titles and items ticked off longer ago are left out.
 */
export function toShoppingItems(tasks: GoogleTask[], now: Date): ShoppingItem[] {
	const byPosition = (a: GoogleTask, b: GoogleTask) => (a.position ?? '').localeCompare(b.position ?? '');
	const usable = tasks.filter((t) => !t.deleted && !t.parent && t.title?.trim());
	const toGet = usable.filter((t) => t.status === 'needsAction').sort(byPosition);
	const ticked = usable
		.filter((t) => t.status === 'completed' && t.completed && now.getTime() - Date.parse(t.completed) < TICKED_MS)
		.sort(byPosition);
	return [...toGet, ...ticked].map((t): ShoppingItem => ({
		id: t.id,
		text: t.title!.trim(),
		tickedOff: t.status === 'completed'
	}));
}
