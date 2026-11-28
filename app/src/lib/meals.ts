// Saved meals and the dinner plan (AB#96), as the Hub shows them. They live in the backend (ADR 0017).
import type { ListStatus } from './task-list.ts';
import { addDays, formatDayMonth, formatWeekday, type DayKey } from './time.ts';

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
	/** With `planFor`, the new meal is planned for that date too, in the same go (AB#99). */
	| { action: 'add'; name: string; ingredients: string[]; planFor?: string }
	| { action: 'edit'; id: string; name: string; ingredients: string[] }
	| { action: 'remove'; id: string }
	| { action: 'plan'; date: string; mealId: string }
	| { action: 'unplan'; date: string };

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

/** How many days the plan shows: today and the next 6, rolling over at midnight, like the Week view. */
export const PLAN_DAYS = 7;

export interface WeekDay {
	date: DayKey;
	/** "Tonight", "Tomorrow", then the weekday: "Sunday". */
	label: string;
	/** "Sat 28 Nov" for today and tomorrow, then "29 Nov". */
	detail: string;
}

/** Today and the next 6 days, as the Meals Section lists them. */
export function weekFrom(today: DayKey): WeekDay[] {
	return Array.from({ length: PLAN_DAYS }, (_, i) => {
		const date = addDays(today, i);
		// "28 November" as "28 Nov".
		const short = formatDayMonth(date).replace(/ (\w{3})\w*$/, ' $1');
		if (i < 2)
			return { date, label: i === 0 ? 'Tonight' : 'Tomorrow', detail: `${formatWeekday(date, 'short')} ${short}` };
		return { date, label: formatWeekday(date, 'long'), detail: short };
	});
}

/** The meal planned for a date, or null if nothing is, or the meal planned has since been removed. */
export function dinnerOn(date: string, plan: PlanDay[], meals: Meal[]): Meal | null {
	const mealId = plan.find((day) => day.date === date)?.mealId;
	return (mealId && meals.find((meal) => meal.id === mealId)) || null;
}
