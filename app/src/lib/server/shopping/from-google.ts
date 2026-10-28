import type { ShoppingItem } from '#lib/shopping.ts';
import { dayKey, type DayKey } from '#lib/time.ts';

export interface GoogleTask {
	id: string;
	title?: string;
	status: 'needsAction' | 'completed';
	completed?: string;
	position?: string;
	deleted?: boolean;
	parent?: string;
}

/**
 * Items still to get, in the list's order, then items ticked off on `today`.
 * Deleted tasks, subtasks, blank titles and items ticked off before today are left out.
 */
export function toShoppingItems(tasks: GoogleTask[], today: DayKey): ShoppingItem[] {
	const byPosition = (a: GoogleTask, b: GoogleTask) => (a.position ?? '').localeCompare(b.position ?? '');
	const usable = tasks.filter((t) => !t.deleted && !t.parent && t.title?.trim());
	const toGet = usable.filter((t) => t.status === 'needsAction').sort(byPosition);
	const ticked = usable
		.filter((t) => t.status === 'completed' && t.completed && dayKey(new Date(t.completed)) === today)
		.sort(byPosition);
	return [...toGet, ...ticked].map(
		(t): ShoppingItem => ({ id: t.id, text: t.title!.trim(), tickedOff: t.status === 'completed' })
	);
}
