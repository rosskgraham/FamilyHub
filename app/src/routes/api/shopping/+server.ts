import type { ShoppingChange } from '#lib/shopping.ts';
import { shopping } from '#lib/server/shopping/index.ts';
import { applyChange, MAX_TEXT } from '#lib/server/tasks/route.ts';
import type { RequestHandler } from './$types';

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
export const POST: RequestHandler = async ({ request }) =>
	applyChange(shopping, parse(await request.json().catch(() => null)), 'Shopping list');
