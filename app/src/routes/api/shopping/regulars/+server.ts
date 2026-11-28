import { error, json } from '@sveltejs/kit';
import { MOST_REGULARS } from '#lib/shopping.ts';
import { shopping } from '#lib/server/shopping/index.ts';
import { MAX_TEXT } from '#lib/server/tasks/route.ts';
import type { RequestHandler } from './$types';

type RegularsChange = { action: 'add'; names: string[] } | { action: 'dont_suggest'; name: string };

const trimmed = (text: unknown) => (typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '');

function parse(body: unknown): RegularsChange | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	if (b.action === 'add' && Array.isArray(b.names)) {
		const names = b.names.map(trimmed);
		return names.length > 0 && names.length <= MOST_REGULARS && names.every(Boolean) ? { action: 'add', names } : null;
	}
	if (b.action === 'dont_suggest') {
		const name = trimmed(b.name);
		return name ? { action: 'dont_suggest', name } : null;
	}
	return null;
}

// The regulars to offer in the Shopping Section's panel (AB#110): the backend's, or the last it gave while it can't be
// reached, leaving out what's on the list.
export const GET: RequestHandler = async () => json(await shopping.regulars());

// Adds the regulars ticked in the panel, each as its own item, or stops one being suggested. While the backend can't be
// reached they wait in the queue, and the answer is 202.
export const POST: RequestHandler = async ({ request }) => {
	const change = parse(await request.json().catch(() => null));
	if (!change) error(400, 'Not a regulars change');
	const status =
		change.action === 'add' ? await shopping.addAll(change.names) : await shopping.dontSuggest(change.name);
	return json({ ok: true }, { status });
};
