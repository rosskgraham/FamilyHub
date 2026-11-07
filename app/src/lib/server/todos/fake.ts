import { compareDue, type Todo, type TodoAddition } from '#lib/todos.ts';
import { addDays, dayKey, type DayKey } from '#lib/time.ts';
import { now } from '../now.ts';
import type { ListSource } from '../tasks/feed.ts';
import { TICKED_MS } from '../tasks/google.ts';

// Sample To-dos kept in memory, due relative to today, so ticking off and adding can be tried
// without Google. They reset when the app restarts.
interface FakeTodo {
	id: string;
	text: string;
	due: DayKey | null;
	tickedOffAt: Date | null;
}

let nextId = 1;
const todo = (text: string, inDays: number | null, tickedOffAt: Date | null = null): FakeTodo => ({
	id: `sample-todo-${nextId++}`,
	text,
	due: inDays === null ? null : addDays(dayKey(now()), inDays),
	tickedOffAt
});

const todos: FakeTodo[] = [
	todo('Renew the car insurance', -3),
	todo('Enter meter readings', 0),
	todo('Return library books', 0),
	todo('Water the plants', 0, now()),
	todo('Pay the window cleaner', 1),
	todo('Book Leo’s dentist check-up', 4),
	todo('Descale the kettle', 4),
	todo('Clean the oven', null)
];

export const fakeTodos: ListSource<TodoAddition, Todo> = {
	async list() {
		const recent = (t: FakeTodo) => !t.tickedOffAt || now().getTime() - t.tickedOffAt.getTime() < TICKED_MS;
		return todos
			.filter(recent)
			.sort((a, b) => compareDue(a.due, b.due))
			.map((t): Todo => ({ id: t.id, text: t.text, due: t.due, tickedOff: t.tickedOffAt !== null }));
	},
	async add({ text, due }) {
		const added: FakeTodo = { id: `sample-todo-${nextId++}`, text, due, tickedOffAt: null };
		todos.push(added);
		return added.id;
	},
	async setTickedOff(id, tickedOff) {
		const found = todos.find((t) => t.id === id);
		if (found) found.tickedOffAt = tickedOff ? now() : null;
	},
	async remove(id) {
		const index = todos.findIndex((t) => t.id === id);
		if (index >= 0) todos.splice(index, 1);
	}
};
