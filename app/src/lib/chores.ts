import type { OwnerId } from './household.ts';
import { weekday, type DayKey } from './time.ts';

// Chores are set up in app/chores.json. Ids are what history is recorded against,
// so a Routine or Chore can be renamed without losing its ticks.

export const CHORE_ICONS = ['teeth', 'bed', 'shirt', 'home', 'music', 'book', 'bin'] as const;
export type ChoreIcon = (typeof CHORE_ICONS)[number];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Routine {
	id: string;
	name: string;
	/** When the Routine starts, as UK `HH:mm`. */
	from: string;
}

export interface Chore {
	id: string;
	name: string;
	icon: ChoreIcon;
	stars: number;
	/** The Routines it's done in, by id. Brushing teeth can be in Morning and Evening. */
	routines: string[];
	/** The Members who do it, by id. */
	who: OwnerId[];
	/** The days it's done on. Every day if left out. */
	days?: Weekday[];
}

/** A job any child can do for extra Stars, once a day. Children who do it together each get its Stars. */
export interface BonusJob {
	id: string;
	name: string;
	stars: number;
	/** The days it's up for grabs. Every day if left out. */
	days?: Weekday[];
}

export interface ChoreConfig {
	/** In the order they happen in the day. */
	routines: Routine[];
	chores: Chore[];
	/** Up for grabs. */
	bonus: BonusJob[];
}

/** Bonus jobs aren't in a Routine, so they're recorded with this in place of one. */
export const UP_FOR_GRABS = '';

/** One thing that happened: a Chore ticked off or unticked. Stars are worked out from these. */
export interface ChoreEvent {
	at: string;
	day: DayKey;
	child: OwnerId;
	chore: string;
	routine: string;
	ticked: boolean;
	/** The Stars a tick earned, kept so changing a Chore's Stars doesn't rewrite history. */
	stars: number;
}

export interface ChoreTick {
	child: OwnerId;
	chore: string;
	routine: string;
	ticked: boolean;
}

export interface RoutineGroup {
	routine: Routine;
	chores: Chore[];
}

const key = (e: { child: string; chore: string; routine: string }) => `${e.child}/${e.chore}/${e.routine}`;

/** A child's Chores on a day, grouped by Routine, leaving out Routines with nothing to do. */
export function choresFor(config: ChoreConfig, child: OwnerId, day: DayKey): RoutineGroup[] {
	const today = WEEKDAYS[weekday(day)]!;
	return config.routines
		.map((routine) => ({
			routine,
			chores: config.chores.filter(
				(c) =>
					c.who.includes(child) &&
					c.routines.includes(routine.id) &&
					(c.days === undefined || c.days.includes(today))
			)
		}))
		.filter((g) => g.chores.length > 0);
}

/** The Bonus jobs up for grabs on a day. */
export function bonusOn(config: ChoreConfig, day: DayKey): BonusJob[] {
	const today = WEEKDAYS[weekday(day)]!;
	return config.bonus.filter((b) => b.days === undefined || b.days.includes(today));
}

/** Who has done each Bonus job on a day: one child, or several who did it together. */
export function bonusDoneBy(events: ChoreEvent[], day: DayKey): Map<string, OwnerId[]> {
	const latest = new Map<string, ChoreEvent>();
	for (const e of events) if (e.day === day && e.routine === UP_FOR_GRABS) latest.set(`${e.child}/${e.chore}`, e);
	const doneBy = new Map<string, OwnerId[]>();
	for (const e of latest.values()) if (e.ticked) doneBy.set(e.chore, [...(doneBy.get(e.chore) ?? []), e.child]);
	return doneBy;
}

/** The children with any Chores at all, in Household order. */
export function children(config: ChoreConfig, household: OwnerId[]): OwnerId[] {
	return household.filter((id) => config.chores.some((c) => c.who.includes(id)));
}

/** What's ticked off on a day, as `child/chore/routine` keys. The latest event for each wins. */
export function tickedOn(events: ChoreEvent[], day: DayKey): Set<string> {
	const latest = new Map<string, boolean>();
	for (const e of events) if (e.day === day) latest.set(key(e), e.ticked);
	return new Set([...latest].filter(([, ticked]) => ticked).map(([k]) => k));
}

export function isTicked(ticked: Set<string>, child: OwnerId, chore: string, routine: string): boolean {
	return ticked.has(key({ child, chore, routine }));
}

/** Every child's Stars: each Chore still ticked off at the end of its day counts once. */
export function starTotals(events: ChoreEvent[]): Map<OwnerId, number> {
	const latest = new Map<string, ChoreEvent>();
	for (const e of events) latest.set(`${e.day}/${key(e)}`, e);
	const totals = new Map<OwnerId, number>();
	for (const e of latest.values()) {
		if (e.ticked) totals.set(e.child, (totals.get(e.child) ?? 0) + e.stars);
	}
	return totals;
}

/** The Routine whose time it is: the last one that has started, or none before the first. */
export function currentRoutine(routines: Routine[], hhmm: string): Routine | undefined {
	return routines.filter((r) => r.from <= hhmm).at(-1);
}

/** A Bonus job as the Chores section shows it. */
export interface BonusView extends Pick<BonusJob, 'id' | 'name' | 'stars'> {
	/** Nobody yet, one child, or several who did it together. */
	doneBy: OwnerId[];
}

/** What a child's lane shows: their Routines today, with what's ticked off. */
export interface ChoreLane {
	child: OwnerId;
	/** All-time Stars. */
	stars: number;
	groups: {
		routine: Routine;
		/** It's this Routine's time. */
		now: boolean;
		/** It hasn't started yet. */
		later: boolean;
		chores: (Pick<Chore, 'id' | 'name' | 'icon' | 'stars'> & { ticked: boolean })[];
	}[];
}
