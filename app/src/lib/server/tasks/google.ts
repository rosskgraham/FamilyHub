import { googleGet, googleRequest } from '../google/auth.ts';

const API = 'https://tasks.googleapis.com/tasks/v1';

/**
 * A task as the Google Tasks API returns it. A repeating task looks just like a one-off: the API has no repeat rule,
 * and the next one isn't listed until it's due. `due` is the date at midnight UTC, without the time set on a phone.
 */
export interface GoogleTask {
	id: string;
	title?: string;
	status: 'needsAction' | 'completed';
	completed?: string;
	due?: string;
	position?: string;
	deleted?: boolean;
	parent?: string;
	/** Set when a phone moves a ticked-off task into its Completed section. It's still just ticked off. */
	hidden?: boolean;
}

/**
 * How long a ticked-off item stays, struck through, so a mis-tap at the Hub can be undone. Not longer: items ticked off
 * in the shop on a phone are bought, and shouldn't fill the wall when everyone gets home.
 */
export const TICKED_MS = 10 * 60_000;

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

const tasksUrl = (listId: string) => `${API}/lists/${encodeURIComponent(listId)}/tasks`;

/**
 * Every task in one list, ticked off or not. Old ticked-off ones come back too, and are filtered out afterwards:
 * Google's `completedMin` would leave out every task that isn't ticked off (tested 7 November 2026).
 */
export async function readTasks(listId: string): Promise<GoogleTask[]> {
	const all: GoogleTask[] = [];
	let pageToken: string | undefined;
	do {
		// Completed items are hidden by default; ask for them to show ones just ticked off.
		const params = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', maxResults: '100' });
		if (pageToken) params.set('pageToken', pageToken);
		const response = await googleGet<TasksResponse>(`${tasksUrl(listId)}?${params}`);
		all.push(...(response.items ?? []));
		pageToken = response.nextPageToken;
	} while (pageToken);
	return all;
}

/** Adds a task, resolving to its id. */
export async function addTask(listId: string, task: { title: string; due?: string }): Promise<string> {
	return (await googleRequest<GoogleTask>('POST', tasksUrl(listId), task)).id;
}

export async function setTaskTickedOff(listId: string, id: string, tickedOff: boolean): Promise<void> {
	await googleRequest(
		'PATCH',
		`${tasksUrl(listId)}/${encodeURIComponent(id)}`,
		tickedOff ? { status: 'completed' } : { status: 'needsAction', completed: null }
	);
}

export async function removeTask(listId: string, id: string): Promise<void> {
	await googleRequest('DELETE', `${tasksUrl(listId)}/${encodeURIComponent(id)}`);
}
