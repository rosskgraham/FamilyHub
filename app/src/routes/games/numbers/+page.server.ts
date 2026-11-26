import { gamesSetup } from '#lib/server/games/index.ts';
import { numberCards } from '#lib/server/games/number-play.ts';
import { now } from '#lib/server/now.ts';
import { dayKey } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

// The Games Section with Number of the day chosen (AB#91). It's remembered, so the Games tab opens here until
// Word of the day is chosen, or midnight.
export const load: PageServerLoad = async () => {
	const setup = await gamesSetup();
	const day = dayKey(now());
	setup.store.chooseGame('numbers', day);
	return { cards: numberCards(setup, day), owners: setup.household };
};
