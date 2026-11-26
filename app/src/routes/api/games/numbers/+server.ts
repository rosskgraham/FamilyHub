import { error, json } from '@sveltejs/kit';
import { OPERATORS, type Operator } from '#lib/number-game.ts';
import { gamesSetup } from '#lib/server/games/index.ts';
import { makeNumberMove, type NumberMove } from '#lib/server/games/number-play.ts';
import type { RequestHandler } from './$types';

const whole = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

/** The move in a request, if it's one. */
function moveOf(body: Record<string, unknown>): NumberMove | null {
	switch (body.kind) {
		case 'step':
			return whole(body.a) && whole(body.b) && OPERATORS.includes(body.op as Operator)
				? { kind: 'step', a: body.a, op: body.op as Operator, b: body.b }
				: null;
		case 'finish':
			return whole(body.value) ? { kind: 'finish', value: body.value } : null;
		case 'undo':
		case 'restart':
			return { kind: body.kind };
		default:
			return null;
	}
}

// A Member makes a move in Number of the day. A step that isn't allowed changes nothing, and says why.
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const move = body && typeof body.member === 'string' ? moveOf(body) : null;
	if (!move) error(400, 'Not a move');
	const result = makeNumberMove(await gamesSetup(), body!.member as string, move);
	if (!result.ok && (result.problem === 'not a player' || result.problem === 'finished')) {
		error(409, result.problem === 'finished' ? 'That game’s finished' : 'Not one of the Household');
	}
	return json(result, { status: result.ok ? 200 : 422 });
};
