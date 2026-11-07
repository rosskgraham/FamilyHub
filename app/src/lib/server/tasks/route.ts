import { error, json } from '@sveltejs/kit';
import type { Addition, Change, Item } from '#lib/task-list.ts';
import { GoogleRefused, SignInNeeded } from '../google/auth.ts';
import type { Feed } from './feed.ts';

/** The longest text an item can have. */
export const MAX_TEXT = 200;

/**
 * A Quick action's answer: 200 once Google has the change, 202 while it waits in the queue,
 * 401 when Google needs signing in again, and 502 when Google turns it down.
 */
export async function applyChange<A extends Addition, I extends Item<A>>(
	feed: Feed<A, I>,
	change: Change<A> | null,
	name: string
): Promise<Response> {
	if (!change) error(400, `Not a ${name} change`);
	try {
		return json({ ok: true }, { status: await feed.apply(change) });
	} catch (e) {
		if (e instanceof SignInNeeded) error(401, 'Google sign-in needed');
		if (e instanceof GoogleRefused) {
			console.error(`${name} change turned down:`, e);
			error(502, 'Google turned the change down');
		}
		throw e;
	}
}
