import { bonusDoneBy, bonusOn, children, choresFor, currentRoutine, isTicked, starTotals, tickedOn, type BonusView, type ChoreLane } from '#lib/chores.ts';
import { choresSetup } from '#lib/server/chores/index.ts';
import { now } from '#lib/server/now.ts';
import { dayKey, formatTime } from '#lib/time.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { config, household, store, sample } = await choresSetup();
	const at = now();
	const day = dayKey(at);
	const time = formatTime(at);
	const events = store.events();
	const ticked = tickedOn(events, day);
	const stars = starTotals(events);
	const current = currentRoutine(config.routines, time);

	const lanes = children(config, Object.keys(household)).map(
		(child): ChoreLane => ({
			child,
			stars: stars.get(child) ?? 0,
			groups: choresFor(config, child, day).map(({ routine, chores }) => ({
				routine,
				now: routine.id === current?.id,
				later: routine.from > time,
				chores: chores.map(({ id, name, icon, stars }) => ({
					id,
					name,
					icon,
					stars,
					ticked: isTicked(ticked, child, id, routine.id)
				}))
			}))
		})
	);
	const doneBy = bonusDoneBy(events, day);
	const bonus = bonusOn(config, day).map(
		({ id, name, stars }): BonusView => ({ id, name, stars, doneBy: doneBy.get(id) ?? [] })
	);
	return { lanes, bonus, owners: household, sample };
};
