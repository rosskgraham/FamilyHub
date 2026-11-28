import { CALENDAR_SOURCE } from '$app/env/private';
import type { MealsResult } from '#lib/meals.ts';
import { backend } from '../backend/index.ts';
import { liveConnected } from '../backend/live.ts';
import { announceListChanged } from '../changes.ts';
import { createMealsFeed } from './backend.ts';
import { fakeMeals } from './fake.ts';

/** The saved meals and the plan: the backend's, once the Hub has its settings and certificate, otherwise samples. */
export const meals = createMealsFeed({
	api: () => backend()?.request ?? null,
	sample: fakeMeals,
	sampleOnly: CALENDAR_SOURCE === 'sample',
	live: liveConnected,
	sent: () => announceListChanged('meals')
});

export const loadMeals = (): Promise<MealsResult> => meals.load();

/** A live update from the backend saying the meals changed: they're fetched, then the screen is told. */
export async function onMealsMessage(list: string): Promise<void> {
	if (list !== 'meals' || CALENDAR_SOURCE === 'sample' || backend() === null) return;
	await meals.refresh();
	announceListChanged('meals');
}
