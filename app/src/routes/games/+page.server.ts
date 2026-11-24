import { gamesSetup, playerCards } from '#lib/server/games/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const setup = await gamesSetup();
	return { cards: playerCards(setup), owners: setup.household };
};
