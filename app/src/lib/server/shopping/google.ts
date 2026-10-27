import type { ShoppingItem } from '#lib/shopping.ts';
import { dayKey } from '#lib/time.ts';
import { googleGet, googleRequest } from '../google/auth.ts';
import type { ShoppingSource } from './source.ts';

const API = 'https://tasks.googleapis.com/tasks/v1';

export interface GoogleTaskList {
	id: string;
	title: string;
}

interface TaskListsResponse {
	items?: { id: string; title: string }[];
}

interface Task {
	id: string;
	title?: string;
	status: 'needsAction' | 'completed';
	completed?: string;
	position?: string;
	deleted?: boolean;
	parent?: string;
}

interface TasksResponse {
	items?: Task[];
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
			const all: Task[] = [];
			let pageToken: string | undefined;
			do {
				// Completed items are hidden by default; ask for them to show today's ticks.
				const params = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', maxResults: '100' });
				if (pageToken) params.set('pageToken', pageToken);
				const response = await googleGet<TasksResponse>(`${tasks}?${params}`);
				all.push(...(response.items ?? []));
				pageToken = response.nextPageToken;
			} while (pageToken);

			const today = dayKey(new Date());
			const byPosition = (a: Task, b: Task) => (a.position ?? '').localeCompare(b.position ?? '');
			const usable = all.filter((t) => !t.deleted && !t.parent && t.title?.trim());
			const toGet = usable.filter((t) => t.status === 'needsAction').sort(byPosition);
			const ticked = usable
				.filter((t) => t.status === 'completed' && t.completed && dayKey(new Date(t.completed)) === today)
				.sort(byPosition);
			return [...toGet, ...ticked].map(
				(t): ShoppingItem => ({ id: t.id, text: t.title!.trim(), tickedOff: t.status === 'completed' })
			);
		},
		async add(text) {
			await googleRequest('POST', tasks, { title: text });
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
