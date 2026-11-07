import type { Todo, TodoAddition } from '#lib/todos.ts';
import type { ListSource } from '../tasks/feed.ts';
import { addTask, readTasks, removeTask, setTaskTickedOff } from '../tasks/google.ts';
import { toTodos } from './from-google.ts';

/** Reads and changes one Google Tasks list: the Household's To-dos. */
export function googleTodos(listId: string): ListSource<TodoAddition, Todo> {
	return {
		list: async () => toTodos(await readTasks(listId), new Date()),
		// Google keeps a due date as midnight UTC on the day.
		add: ({ text, due }) => addTask(listId, due ? { title: text, due: `${due}T00:00:00.000Z` } : { title: text }),
		setTickedOff: (id, tickedOff) => setTaskTickedOff(listId, id, tickedOff),
		remove: (id) => removeTask(listId, id)
	};
}
