import { parseTodoChange } from '#lib/server/todos/change.ts';
import { applyChange } from '#lib/server/tasks/route.ts';
import { todos } from '#lib/server/todos/index.ts';
import type { RequestHandler } from './$types';

// Quick actions on To-dos: add a one-off To-do, and tick off or untick. There's no removing them at the Hub.
// While Google can't be reached they wait in a queue, and the answer is 202.
export const POST: RequestHandler = async ({ request }) =>
	applyChange(todos, parseTodoChange(await request.json().catch(() => null)), 'To-dos');
