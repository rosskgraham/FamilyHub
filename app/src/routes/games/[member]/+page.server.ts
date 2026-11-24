import { error, redirect } from '@sveltejs/kit';
import { gamesSetup, gameToPlay, players } from '#lib/server/games/index.ts';
import type { PageServerLoad } from './$types';

// A Member's Word of the day. A finished game goes back to the Games Section, so its letters are never shown again.
export const load: PageServerLoad = async ({ params }) => {
	const setup = await gamesSetup();
	if (!players(setup.household).includes(params.member)) error(404, 'Not one of the Household');
	const game = gameToPlay(setup, params.member);
	if (!game) redirect(303, '/games');
	return { member: params.member, owner: setup.household[params.member]!, owners: setup.household, goes: game.goes };
};
