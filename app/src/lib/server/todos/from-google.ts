import { compareDue, type Todo } from '#lib/todos.ts';
import { TICKED_MS, type GoogleTask } from '../tasks/google.ts';

/**
 * To-dos still to do and ones ticked off in the last few minutes, in order of when they're due, undated last, then in the
 * list's order. A task a phone has hidden in its Completed section is just ticked off. Deleted tasks, subtasks, blank
 * titles and To-dos ticked off longer ago are left out.
 */
export function toTodos(tasks: GoogleTask[], now: Date): Todo[] {
	const due = (t: GoogleTask) => t.due?.slice(0, 10) ?? null;
	const recent = (t: GoogleTask) =>
		t.status === 'needsAction' || (t.completed !== undefined && now.getTime() - Date.parse(t.completed) < TICKED_MS);
	return tasks
		.filter((t) => !t.deleted && !t.parent && t.title?.trim() && recent(t))
		.sort((a, b) => compareDue(due(a), due(b)) || (a.position ?? '').localeCompare(b.position ?? ''))
		.map((t): Todo => ({ id: t.id, text: t.title!.trim(), due: due(t), tickedOff: t.status === 'completed' }));
}
