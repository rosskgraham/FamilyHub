// To-dos: the Household's one-off and repeating jobs, from a Google Tasks list. Repeats are set up on phones; the Hub
// only sees each To-do once Google lists it, with its due date but not its time.
import type { Change, Item, ListStatus } from './task-list.ts';
import { addDays, formatDayMonth, formatWeekday, type DayKey } from './time.ts';

/** What adding a To-do at the Hub takes. Only one-off To-dos can be added there. */
export type TodoAddition = { text: string; due: DayKey | null };

export type Todo = Item<TodoAddition>;

export type TodosStatus = ListStatus;

/**
 * What the screen asks the server to change. Removing a repeating To-do skips that one occurrence: Google lists the next
 * one straight away, and the repeat carries on (tested 8 November 2026).
 */
export type TodoChange = Change<TodoAddition>;

/** Sooner due dates first, and no date last. */
export function compareDue(a: DayKey | null, b: DayKey | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a.localeCompare(b);
}

const byDue = (a: Todo, b: Todo) => compareDue(a.due, b.due);

/** To-dos due today or before, overdue first. One just ticked off stays, so it can be unticked. */
export function dueBy(todos: Todo[], today: DayKey): Todo[] {
	return todos.filter((t) => t.due !== null && t.due <= today).sort(byDue);
}

function daysBetween(from: DayKey, to: DayKey): number {
	return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** "Today", "Tomorrow", or how late a To-do is, such as "3 days late". */
export function lateness(due: DayKey, today: DayKey): string {
	const late = daysBetween(due, today);
	if (late === 0) return 'Today';
	if (late === -1) return 'Tomorrow';
	if (late < 0) return `${formatWeekday(due, 'long')} ${formatDayMonth(due)}`;
	return `${late} ${late === 1 ? 'day' : 'days'} late`;
}

export interface TodoGroup {
	title: string;
	todos: Todo[];
}

/** For the To-dos Section: overdue, today, tomorrow, each later day, then To-dos with no date. */
export function groupTodos(todos: Todo[], today: DayKey): TodoGroup[] {
	const groups = new Map<string, Todo[]>();
	const put = (title: string, todo: Todo) => groups.set(title, [...(groups.get(title) ?? []), todo]);
	const tomorrow = addDays(today, 1);
	const dated = todos.filter((t) => t.due !== null).sort(byDue);
	for (const t of dated) {
		if (t.due! < today) put('Overdue', t);
		else if (t.due === today) put('Today', t);
		else if (t.due === tomorrow) put('Tomorrow', t);
		else put(`${formatWeekday(t.due!, 'long')} ${formatDayMonth(t.due!)}`, t);
	}
	for (const t of todos.filter((t) => t.due === null)) put('No date', t);
	return [...groups].map(([title, todos]) => ({ title, todos }));
}
