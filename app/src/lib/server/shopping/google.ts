import { dayKey } from '#lib/time.ts';
import { googleGet, googleRequest } from '../google/auth.ts';
import { toShoppingItems, type GoogleTask } from './from-google.ts';
import type { ShoppingSource } from './source.ts';

const API = 'https://tasks.googleapis.com/tasks/v1';

export interface GoogleTaskList {
	id: string;
	title: string;
}

interface TaskListsResponse {
	items?: { id: string; title: string }[];
}

interface TasksResponse {
	items?: GoogleTask[];
	nextPageToken?: string;
}

export async function listTaskLists(): Promise<GoogleTaskList[]> {
	const response = await googleGet<TaskListsResponse>(`${API}/users/@me/lists?maxResults=100`);
	return (response.items ?? []).map((l) => ({ id: l.id, title: l.title }));
}

/** Reads and changes one Google Tasks list: the Shopping list. */
export function googleShopping(listId: string): ShoppingSource {
	const tasks = `${API}/lists/${encodeURIComponent(listId)}/tasks`;
	return {
		async list() {
			const all: GoogleTask[] = [];
			let pageToken: string | undefined;
			do {
				// Completed items are hidden by default; ask for them to show today's ticks.
				const params = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', maxResults: '100' });
				if (pageToken) params.set('pageToken', pageToken);
				const response = await googleGet<TasksResponse>(`${tasks}?${params}`);
				all.push(...(response.items ?? []));
				pageToken = response.nextPageToken;
			} while (pageToken);

			return toShoppingItems(all, dayKey(new Date()));
		},
		async add(text) {
			const task = await googleRequest<GoogleTask>('POST', tasks, { title: text });
			return task.id;
		},
		async setTickedOff(id, tickedOff) {
			await googleRequest(
				'PATCH',
				`${tasks}/${encodeURIComponent(id)}`,
				tickedOff ? { status: 'completed' } : { status: 'needsAction', completed: null }
			);
		},
		async remove(id) {
			await googleRequest('DELETE', `${tasks}/${encodeURIComponent(id)}`);
		}
	};
}
