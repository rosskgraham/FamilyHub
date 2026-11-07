import type { Todo, TodoAddition } from '#lib/todos.ts';
import { createFeed, type ListResult } from '../tasks/feed.ts';
import { fakeTodos } from './fake.ts';
import { googleTodos } from './google.ts';

export type TodosResult = ListResult<Todo>;

/** The Household's To-dos: the chosen Google Tasks list once the Hub is set up, otherwise sample ones. */
export const todos = createFeed<TodoAddition, Todo>({
	name: 'To-dos',
	listId: (settings) => settings.todoList,
	sample: fakeTodos,
	google: googleTodos,
	cacheFile: 'todos-cache.json',
	queueFile: 'todos-queue.json'
});

export const loadTodos = (): Promise<TodosResult> => todos.load();
