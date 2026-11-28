import { randomUUID } from 'node:crypto';
import type { Meal, MealChange, PlanDay } from '#lib/meals.ts';

/** A meal as GET /meals gives it. See backend/README.md (Meals and the plan). */
export interface BackendMeal {
	id: string;
	name: string;
	ingredients: string[];
	removed: boolean;
	seq: number;
}

export interface BackendPlanDay {
	date: string;
	meal_id: string | null;
	seq: number;
}

/** A change as POST /meals/operations takes it. Both ids are made on the Hub, so a resend changes nothing. */
export type MealOperation =
	| { id: string; type: 'add_meal'; meal_id: string; name: string; ingredients: string[] }
	| { id: string; type: 'edit_meal'; meal_id: string; name: string; ingredients: string[] }
	| { id: string; type: 'remove_meal'; meal_id: string };

/** What the Hub keeps: the meals not removed and the days planned, from GET /meals?after=0. */
export function fromBackend(meals: BackendMeal[], plan: BackendPlanDay[]): { meals: Meal[]; plan: PlanDay[] } {
	return {
		meals: meals
			.filter((m) => !m.removed)
			.map((m) => ({ id: m.id, name: m.name, ingredients: m.ingredients, saving: false })),
		plan: plan.map((d) => ({ date: d.date, mealId: d.meal_id }))
	};
}

/** The operation for a change at the Hub. An added meal gets its id here, so it never needs swapping for another. */
export function toOperation(change: MealChange, newId: () => string = randomUUID): MealOperation {
	if (change.action === 'add')
		return { id: newId(), type: 'add_meal', meal_id: newId(), name: change.name, ingredients: change.ingredients };
	if (change.action === 'edit')
		return { id: newId(), type: 'edit_meal', meal_id: change.id, name: change.name, ingredients: change.ingredients };
	return { id: newId(), type: 'remove_meal', meal_id: change.id };
}

/** The meals as they will be once the operations waiting are sent, those they touch marked as saving. */
export function withOperations(meals: Meal[], operations: MealOperation[]): Meal[] {
	let result = meals;
	for (const op of operations) {
		if (op.type === 'add_meal')
			result = [...result, { id: op.meal_id, name: op.name, ingredients: op.ingredients, saving: true }];
		else if (op.type === 'edit_meal')
			result = result.map((m) =>
				m.id === op.meal_id ? { ...m, name: op.name, ingredients: op.ingredients, saving: true } : m
			);
		else result = result.filter((m) => m.id !== op.meal_id);
	}
	return result;
}
