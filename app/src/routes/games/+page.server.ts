import { redirect } from '@sveltejs/kit';
import { gamesSetup, playerCards } from '#lib/server/games/index.ts';
import { now } from '#lib/server/now.ts';
import { dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// The Games Section opens on the game chosen last today (AB#91). Choosing Word of the day from the list says so.
export const load: PageServerLoad = async ({ url }) => {
	const setup = await gamesSetup();
	const day = dayKey(now());
	if (url.searchParams.get('game') === 'word') setup.store.chooseGame('word', day);
	else if (setup.store.chosenGame(day) === 'numbers') redirect(303, `/games/numbers${url.search}`);
	return { cards: playerCards(setup, day), owners: setup.household };
};
