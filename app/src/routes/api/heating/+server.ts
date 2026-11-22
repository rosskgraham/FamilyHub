import { error, json } from '@sveltejs/kit';
import { isAllowedTarget } from '#lib/heating.ts';
import { changeHeatingTarget } from '#lib/server/nest/index.ts';
import type { RequestHandler } from './$types';

// A new target for the heating, from the Heating panel (ADR 0013): only in Heat, between 16° and 22°, in 0.5° steps.
// The answer has the heating as the thermostat then reports it, so the panel shows what the Nest accepted.
export const POST: RequestHandler = async ({ request }) => {
	const target = ((await request.json().catch(() => null)) as { target?: unknown } | null)?.target;
	if (!isAllowedTarget(target)) error(400, 'The target must be between 16° and 22°, in 0.5° steps');
	const change = await changeHeatingTarget(target);
	if (!change) error(404, 'The Nest isn’t connected');
	return json(change, { status: change.outcome === 'refused' ? 409 : 200 });
};
