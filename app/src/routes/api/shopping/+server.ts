import { error, json } from '@sveltejs/kit';
import type { ShoppingChange } from '#lib/shopping.ts';
import { SignInNeeded } from '#lib/server/google/auth.ts';
import { shoppingSource } from '#lib/server/shopping/index.ts';
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
export const POST: RequestHandler = async ({ request }) => {
	const change = parse(await request.json().catch(() => null));
	if (!change) error(400, 'Not a Shopping list change');

	const { source } = await shoppingSource();
	try {
		if (change.action === 'add') await source.add(change.text);
		else if (change.action === 'tick') await source.setTickedOff(change.id, change.tickedOff);
		else await source.remove(change.id);
	} catch (e) {
		if (e instanceof SignInNeeded) error(401, 'Google sign-in needed');
		console.error('Shopping list change failed:', e);
		error(502, 'Google could not be reached');
	}
	return json({ ok: true });
};
