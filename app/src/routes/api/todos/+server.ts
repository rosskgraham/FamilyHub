import type { TodoChange } from '#lib/todos.ts';
import { applyChange, MAX_TEXT } from '#lib/server/tasks/route.ts';
import { todos } from '#lib/server/todos/index.ts';
import type { RequestHandler } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parse(body: unknown): TodoChange | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	if (
		b.action === 'add' &&
		typeof b.text === 'string' &&
		(b.due === null || (typeof b.due === 'string' && DAY.test(b.due)))
	) {
		const text = b.text.trim().slice(0, MAX_TEXT);
		return text ? { action: 'add', text, due: b.due } : null;
	}
	if (b.action === 'tick' && typeof b.id === 'string' && typeof b.tickedOff === 'boolean') {
		return { action: 'tick', id: b.id, tickedOff: b.tickedOff };
	}
	return null;
}

// Quick actions on To-dos: add a one-off To-do, and tick off or untick. There's no removing them at the Hub.
// While Google can't be reached they wait in a queue, and the answer is 202.
export const POST: RequestHandler = async ({ request }) =>
	applyChange(todos, parse(await request.json().catch(() => null)), 'To-dos');
