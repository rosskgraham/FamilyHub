// Saved meals and the dinner plan (AB#96), as the Hub shows them. They live in the backend (ADR 0017).
import type { ListStatus } from './task-list.ts';

/** A saved meal: a name and its ingredients, in order. */
export interface Meal {
	id: string;
	name: string;
	ingredients: string[];
	/** Changed at the Hub, and the backend doesn't have it yet. */
	saving: boolean;
}

/** A date's dinner, the Household's local date as YYYY-MM-DD. */
export interface PlanDay {
	date: string;
	mealId: string | null;
}

export interface MealsResult {
	meals: Meal[];
	plan: PlanDay[];
	status: ListStatus;
}

/** What the screen asks the server to change. An edit replaces the name and the whole ingredient list. */
export type MealChange =
	| { action: 'add'; name: string; ingredients: string[] }
	| { action: 'edit'; id: string; name: string; ingredients: string[] }
	| { action: 'remove'; id: string };

/** The most ingredients a meal can have, as the backend allows. */
export const MOST_INGREDIENTS = 50;

/** A–Z by name, ignoring case and accents. */
export function byName(a: Meal, b: Meal): number {
	return a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });
}

/** What a meal's tile says under its name: "6 ingredients · chicken thighs, onions, curry paste…", or "No ingredients". */
export function mealDetail(ingredients: string[]): string {
	const n = ingredients.length;
	if (n === 0) return 'No ingredients';
	const first = ingredients.slice(0, 3).join(', ');
	return `${n} ingredient${n === 1 ? '' : 's'} · ${first}${n > 3 ? '…' : ''}`;
}

/** The first day from `today` on that `mealId` is planned for, if any, to say which goes empty if it's removed. */
export function plannedFrom(plan: PlanDay[], mealId: string, today: string): string | null {
	return (
		plan
			.filter((day) => day.mealId === mealId && day.date >= today)
			.map((day) => day.date)
			.sort()[0] ?? null
	);
}
