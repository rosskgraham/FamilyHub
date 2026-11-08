import type { TodoChange } from '#lib/todos.ts';
import { MAX_TEXT } from '../tasks/route.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A To-do change the screen sent, or null if it isn't one: an add with an optional due date, a tick, or a remove. */
export function parseTodoChange(body: unknown): TodoChange | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	if (b.action === 'add' && typeof b.text === 'string') {
		if (b.due !== null && !(typeof b.due === 'string' && DAY.test(b.due))) return null;
		const text = b.text.trim().slice(0, MAX_TEXT);
		return text ? { action: 'add', text, due: b.due } : null;
	}
	if (b.action === 'tick' && typeof b.id === 'string' && typeof b.tickedOff === 'boolean') {
		return { action: 'tick', id: b.id, tickedOff: b.tickedOff };
	}
	if (b.action === 'remove' && typeof b.id === 'string') return { action: 'remove', id: b.id };
	return null;
}
