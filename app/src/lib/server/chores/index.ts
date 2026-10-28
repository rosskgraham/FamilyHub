import { CALENDAR_SOURCE } from '$app/env/private';
import { bonusDoneBy, bonusOn, children, choresFor, UP_FOR_GRABS, type ChoreConfig, type ChoreEvent, type ChoreTick } from '#lib/chores.ts';
import { sampleHousehold, type Household } from '#lib/household.ts';
import { addDays, dayKey, formatTime, type DayKey } from '#lib/time.ts';
import { configuredHousehold } from '../household.ts';
import { now } from '../now.ts';
import { sampleChores, configuredChores } from './config.ts';
import { openChoreStore, type ChoreStore } from './store.ts';

const DATABASE = 'data/hub.db';

export interface ChoresSetup {
	config: ChoreConfig;
	household: Household;
	store: ChoreStore;
	sample: boolean;
}

let real: ChoreStore | undefined;
let sample: ChoreStore | undefined;

/**
 * The Chores from app/chores.json with the real Household and database, or sample Chores,
 * the sample Household and a sample record kept in memory, which resets when the app restarts.
 * CALENDAR_SOURCE=sample forces the sample.
 */
export async function choresSetup(): Promise<ChoresSetup> {
	const { household } = await configuredHousehold();
	const config = CALENDAR_SOURCE === 'sample' ? null : await configuredChores(household);
	if (config) return { config, household, store: (real ??= openChoreStore(DATABASE)), sample: false };
	if (!sample) {
		sample = openChoreStore(':memory:');
		for (const event of sampleHistory(dayKey(now()))) sample.record(event);
	}
	return { config: sampleChores, household: sampleHousehold, store: sample, sample: true };
}

/**
 * Records a tick or untick, if it's a Chore the child really has today, or a Bonus job that's
 * still up for grabs (or theirs, to undo). Returns false if not.
 */
export function recordTick(setup: ChoresSetup, tick: ChoreTick): boolean {
	const { config, store } = setup;
	const at = now();
	const day = dayKey(at);
	const job =
		tick.routine === UP_FOR_GRABS
			? bonusJob(setup, tick, day)
			: choresFor(config, tick.child, day)
					.find((g) => g.routine.id === tick.routine)
					?.chores.find((c) => c.id === tick.chore);
	if (!job) return false;
	store.record({ ...tick, at: at.toISOString(), day, stars: tick.ticked ? job.stars : 0 });
	return true;
}

// First come: a Bonus job someone has done today is theirs until they undo it.
function bonusJob({ config, household, store }: ChoresSetup, tick: ChoreTick, day: DayKey) {
	if (!children(config, Object.keys(household)).includes(tick.child)) return undefined;
	const job = bonusOn(config, day).find((b) => b.id === tick.chore);
	const doneBy = bonusDoneBy(store.events(), day).get(tick.chore);
	if (tick.ticked ? doneBy !== undefined : doneBy !== tick.child) return undefined;
	return job;
}

// A believable week for the sample: most Chores done on the last six days, and this
// morning Leo has finished while Maya has one to go.
function sampleHistory(today: DayKey): ChoreEvent[] {
	const events: ChoreEvent[] = [];
	const tick = (day: DayKey, child: string, chore: string, routine: string) => {
		const stars = sampleChores.chores.find((c) => c.id === chore)!.stars;
		events.push({ at: `${day}T07:00:00.000Z`, day, child, chore, routine, ticked: true, stars });
	};
	for (let back = 6; back >= 1; back--) {
		const day = addDays(today, -back);
		for (const child of ['maya', 'leo']) {
			for (const group of choresFor(sampleChores, child, day)) {
				group.chores.forEach((c, i) => {
					// Leave a few undone, as real weeks go.
					if ((back + i + child.length) % 5 !== 0) tick(day, child, c.id, group.routine.id);
				});
			}
		}
	}
	// Bonus jobs on a few days.
	for (const [back, child, job] of [[1, 'leo', 'dishwasher'], [2, 'maya', 'table'], [3, 'maya', 'dishwasher']] as const) {
		const stars = sampleChores.bonus.find((b) => b.id === job)!.stars;
		const day = addDays(today, -back);
		events.push({ at: `${day}T17:00:00.000Z`, day, child, chore: job, routine: UP_FOR_GRABS, ticked: true, stars });
	}
	if (formatTime(now()) >= sampleChores.routines[0]!.from) {
		for (const chore of ['teeth', 'bed', 'dressed']) tick(today, 'leo', chore, 'morning');
		for (const chore of ['teeth', 'bed']) tick(today, 'maya', chore, 'morning');
	}
	return events;
}
