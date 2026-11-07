import { now } from '#lib/server/now.ts';
import { loadTodos } from '#lib/server/todos/index.ts';
import { dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ today: dayKey(now()), todos: await loadTodos() });
