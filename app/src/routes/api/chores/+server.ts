import { error, json } from '@sveltejs/kit';
import type { ChoreTick } from '#lib/chores.ts';
import { choresSetup, recordTick } from '#lib/server/chores/index.ts';
import type { RequestHandler } from './$types';

function parse(body: unknown): ChoreTick | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	if (typeof b.child !== 'string' || typeof b.chore !== 'string' || typeof b.routine !== 'string') return null;
	if (typeof b.ticked !== 'boolean') return null;
	return { child: b.child, chore: b.chore, routine: b.routine, ticked: b.ticked };
}

// A child ticks a Chore off or unticks it, or does a Bonus job or undoes it.
export const POST: RequestHandler = async ({ request }) => {
	const tick = parse(await request.json().catch(() => null));
	if (!tick) error(400, 'Not a Chore tick');
	if (!recordTick(await choresSetup(), tick)) error(409, 'Not one of that child’s Chores today, or they’ve already done it');
	return json({ ok: true });
};
