import { error, redirect } from '@sveltejs/kit';
import { gamesSetup, players } from '#lib/server/games/index.ts';
import { numberGameToPlay } from '#lib/server/games/number-play.ts';
import type { PageServerLoad } from './$types';

// A Member's Number of the day (AB#91). A finished game goes back to the Games Section, as it can't be played again.
export const load: PageServerLoad = async ({ params }) => {
	const setup = await gamesSetup();
	if (!players(setup.household).includes(params.member)) error(404, 'Not one of the Household');
	const game = numberGameToPlay(setup, params.member);
	if (!game) redirect(303, '/games/numbers');
	return { member: params.member, owner: setup.household[params.member]!, owners: setup.household, game };
};
