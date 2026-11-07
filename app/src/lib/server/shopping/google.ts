import { addTask, readTasks, removeTask, setTaskTickedOff } from '../tasks/google.ts';
import { toShoppingItems } from './from-google.ts';
import type { ShoppingSource } from './source.ts';

/** Reads and changes one Google Tasks list: the Shopping list. */
export function googleShopping(listId: string): ShoppingSource {
	return {
		list: async () => toShoppingItems(await readTasks(listId), new Date()),
		add: ({ text }) => addTask(listId, { title: text }),
		setTickedOff: (id, tickedOff) => setTaskTickedOff(listId, id, tickedOff),
		remove: (id) => removeTask(listId, id)
	};
}
