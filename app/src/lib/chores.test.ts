import { describe, expect, it } from 'vitest';
import { bonusDoneBy, bonusOn, children, choresFor, currentRoutine, isTicked, starTotals, tickedOn, UP_FOR_GRABS, type ChoreConfig, type ChoreEvent } from './chores.ts';

const config: ChoreConfig = {
	routines: [
		{ id: 'morning', name: 'Morning', from: '06:30' },
		{ id: 'evening', name: 'Evening', from: '18:00' }
	],
	chores: [
		{ id: 'teeth', name: 'Brush your teeth', icon: 'teeth', stars: 1, routines: ['morning', 'evening'], who: ['maya', 'leo'] },
		{ id: 'bed', name: 'Make your bed', icon: 'bed', stars: 1, routines: ['morning'], who: ['maya'] },
		{ id: 'bins', name: 'Put the bins out', icon: 'bin', stars: 3, routines: ['evening'], who: ['leo'], days: ['Wed'] }
	],
	bonus: [
		{ id: 'dishwasher', name: 'Empty the dishwasher', stars: 2 },
		{ id: 'big-shop', name: 'Help with the big shop', stars: 3, days: ['Sat'] }
	]
};

// 28 October 2026 is a Wednesday.
const WED = '2026-10-28';
const THU = '2026-10-29';

const event = (day: string, child: string, chore: string, routine: string, ticked = true, stars = 1): ChoreEvent => ({
	at: `${day}T08:00:00.000Z`,
	day,
	child,
	chore,
	routine,
	ticked,
	stars: ticked ? stars : 0
});

describe('choresFor', () => {
	it('groups a child’s Chores by Routine, with a Chore in every Routine it belongs to', () => {
		const groups = choresFor(config, 'maya', THU);
		expect(groups.map((g) => [g.routine.id, g.chores.map((c) => c.id)])).toEqual([
			['morning', ['teeth', 'bed']],
			['evening', ['teeth']]
		]);
	});

	it('only includes a Chore with days on those days', () => {
		const evening = (day: string) => choresFor(config, 'leo', day).find((g) => g.routine.id === 'evening')!.chores.map((c) => c.id);
		expect(evening(WED)).toEqual(['teeth', 'bins']);
		expect(evening(THU)).toEqual(['teeth']);
	});

	it('leaves out Routines with nothing to do', () => {
		const only = { ...config, chores: [config.chores[1]!] };
		expect(choresFor(only, 'maya', WED).map((g) => g.routine.id)).toEqual(['morning']);
	});
});

describe('children', () => {
	it('lists Members with any Chores, in Household order', () => {
		expect(children(config, ['alex', 'sam', 'leo', 'maya'])).toEqual(['leo', 'maya']);
	});
});

describe('tickedOn', () => {
	it('keeps each Routine’s tick separate', () => {
		const ticked = tickedOn([event(WED, 'maya', 'teeth', 'morning')], WED);
		expect(isTicked(ticked, 'maya', 'teeth', 'morning')).toBe(true);
		expect(isTicked(ticked, 'maya', 'teeth', 'evening')).toBe(false);
		expect(isTicked(ticked, 'leo', 'teeth', 'morning')).toBe(false);
	});

	it('takes the latest event, so an untick undoes a tick', () => {
		const events = [event(WED, 'maya', 'bed', 'morning'), event(WED, 'maya', 'bed', 'morning', false)];
		expect(isTicked(tickedOn(events, WED), 'maya', 'bed', 'morning')).toBe(false);
	});

	it('starts each day fresh', () => {
		expect(tickedOn([event(WED, 'maya', 'bed', 'morning')], THU).size).toBe(0);
	});
});

describe('starTotals', () => {
	it('counts each Chore still ticked at the end of its day once, across days', () => {
		const events = [
			event(WED, 'leo', 'bins', 'evening', true, 3),
			event(WED, 'leo', 'teeth', 'morning'),
			event(WED, 'leo', 'teeth', 'evening'),
			event(THU, 'leo', 'teeth', 'morning'),
			// Ticked, unticked and ticked again still counts once.
			event(THU, 'maya', 'bed', 'morning'),
			event(THU, 'maya', 'bed', 'morning', false),
			event(THU, 'maya', 'bed', 'morning')
		];
		expect(Object.fromEntries(starTotals(events))).toEqual({ leo: 6, maya: 1 });
	});

	it('takes nothing for a Chore unticked by the end of its day', () => {
		const events = [event(WED, 'maya', 'bed', 'morning'), event(WED, 'maya', 'bed', 'morning', false)];
		expect(starTotals(events).get('maya')).toBeUndefined();
	});

	it('keeps the Stars a tick earned, even if the Chore is worth more later', () => {
		expect(starTotals([event(WED, 'leo', 'bins', 'evening', true, 2)]).get('leo')).toBe(2);
	});
});

describe('Bonus jobs', () => {
	const grab = (day: string, child: string, job: string, ticked = true) => event(day, child, job, UP_FOR_GRABS, ticked, 2);

	it('are up for grabs on their days', () => {
		expect(bonusOn(config, WED).map((b) => b.id)).toEqual(['dishwasher']);
		expect(bonusOn(config, '2026-10-31').map((b) => b.id)).toEqual(['dishwasher', 'big-shop']);
	});

	it('belong to whoever did them that day', () => {
		const done = bonusDoneBy([grab(WED, 'leo', 'dishwasher')], WED);
		expect(Object.fromEntries(done)).toEqual({ dishwasher: 'leo' });
		expect(bonusDoneBy([grab(WED, 'leo', 'dishwasher')], THU).size).toBe(0);
	});

	it('go back up for grabs when undone', () => {
		const events = [grab(WED, 'leo', 'dishwasher'), grab(WED, 'leo', 'dishwasher', false), grab(WED, 'maya', 'dishwasher')];
		expect(bonusDoneBy(events, WED).get('dishwasher')).toBe('maya');
	});

	it('add to the Stars of whoever did them', () => {
		expect(starTotals([grab(WED, 'leo', 'dishwasher'), event(WED, 'leo', 'teeth', 'morning')]).get('leo')).toBe(3);
	});

	it('don’t count as a Routine’s Chores', () => {
		expect(tickedOn([grab(WED, 'leo', 'dishwasher')], WED).has('leo/dishwasher/morning')).toBe(false);
	});
});

describe('currentRoutine', () => {
	it('is the last Routine to have started', () => {
		expect(currentRoutine(config.routines, '08:15')?.id).toBe('morning');
		expect(currentRoutine(config.routines, '18:00')?.id).toBe('evening');
		expect(currentRoutine(config.routines, '23:59')?.id).toBe('evening');
	});

	it('is none before the first Routine', () => {
		expect(currentRoutine(config.routines, '05:00')).toBeUndefined();
	});
});
