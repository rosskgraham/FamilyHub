import { error, json } from '@sveltejs/kit';
import type { ShoppingChange } from '#lib/shopping.ts';
import { GoogleRefused, SignInNeeded } from '#lib/server/google/auth.ts';
import { shoppingSource } from '#lib/server/shopping/index.ts';
import { addToQueue, QUEUED_ID, readQueue, sendQueue } from '#lib/server/shopping/queue.ts';
import type { RequestHandler } from './$types';

const MAX_TEXT = 200;

function parse(body: unknown): ShoppingChange | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	if (b.action === 'add' && typeof b.text === 'string') {
		const text = b.text.trim().slice(0, MAX_TEXT);
		return text ? { action: 'add', text } : null;
	}
	if (b.action === 'tick' && typeof b.id === 'string' && typeof b.tickedOff === 'boolean') {
		return { action: 'tick', id: b.id, tickedOff: b.tickedOff };
	}
	if (b.action === 'remove' && typeof b.id === 'string') return { action: 'remove', id: b.id };
	return null;
}

// Quick actions on the Shopping list: add, tick off or untick, and remove.
// While Google can't be reached they wait in a queue, and the answer is 202.
export const POST: RequestHandler = async ({ request }) => {
	const change = parse(await request.json().catch(() => null));
	if (!change) error(400, 'Not a Shopping list change');

	const { source, live } = await shoppingSource();
	// Behind earlier changes still waiting, so they reach Google in the order they were made.
	if (live && ((change.action !== 'add' && change.id.startsWith(QUEUED_ID)) || (await readQueue()).length > 0)) {
		await addToQueue(change);
		const waiting = await sendQueue(source);
		return json({ ok: true }, { status: waiting.length > 0 ? 202 : 200 });
	}
	try {
		if (change.action === 'add') await source.add(change.text);
		else if (change.action === 'tick') await source.setTickedOff(change.id, change.tickedOff);
		else await source.remove(change.id);
	} catch (e) {
		if (e instanceof SignInNeeded) error(401, 'Google sign-in needed');
		if (e instanceof GoogleRefused) {
			console.error('Shopping list change turned down:', e);
			error(502, 'Google turned the change down');
		}
		console.error('Shopping list change queued:', e);
		await addToQueue(change);
		return json({ ok: true }, { status: 202 });
	}
	return json({ ok: true });
};
