import { error, json } from '@sveltejs/kit';
import { gamesSetup, makeGo } from '#lib/server/games/index.ts';
import type { RequestHandler } from './$types';

// A Member has a go at Word of the day. A go that's too short or not a word is turned down and uses no go.
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (typeof body?.member !== 'string' || typeof body.word !== 'string') error(400, 'Not a go');
	const result = makeGo(await gamesSetup(), body.member, body.word);
	if (!result.ok && (result.problem === 'not a player' || result.problem === 'finished')) {
		error(409, result.problem === 'finished' ? 'That game’s finished' : 'Not one of the Household');
	}
	return json(result, { status: result.ok ? 200 : 422 });
};
