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
	| { id: string; type: 'remove_meal'; meal_id: string }
	| { id: string; type: 'plan'; date: string; meal_id: string }
	| { id: string; type: 'unplan'; date: string };

/** What the Hub keeps: the meals not removed and the days planned, from GET /meals?after=0. */
export function fromBackend(meals: BackendMeal[], plan: BackendPlanDay[]): { meals: Meal[]; plan: PlanDay[] } {
	return {
		meals: meals
			.filter((m) => !m.removed)
			.map((m) => ({ id: m.id, name: m.name, ingredients: m.ingredients, saving: false })),
		plan: plan.map((d) => ({ date: d.date, mealId: d.meal_id }))
	};
}

/**
 * The operations for a change at the Hub. An added meal gets its id here, so it never needs swapping for another, and
 * one planned as it's added is planned in the same batch, after it.
 */
export function toOperations(change: MealChange, newId: () => string = randomUUID): MealOperation[] {
	switch (change.action) {
		case 'add': {
			const meal_id = newId();
			const add: MealOperation = {
				id: newId(),
				type: 'add_meal',
				meal_id,
				name: change.name,
				ingredients: change.ingredients
			};
			return change.planFor ? [add, { id: newId(), type: 'plan', date: change.planFor, meal_id }] : [add];
		}
		case 'edit':
			return [
				{ id: newId(), type: 'edit_meal', meal_id: change.id, name: change.name, ingredients: change.ingredients }
			];
		case 'remove':
			return [{ id: newId(), type: 'remove_meal', meal_id: change.id }];
		case 'plan':
			return [{ id: newId(), type: 'plan', date: change.date, meal_id: change.mealId }];
		case 'unplan':
			return [{ id: newId(), type: 'unplan', date: change.date }];
	}
}

/** The meals and plan as they will be once the operations waiting are sent, meals they touch marked as saving. */
export function withOperations(
	saved: { meals: Meal[]; plan: PlanDay[] },
	operations: MealOperation[]
): { meals: Meal[]; plan: PlanDay[] } {
	let result = saved.meals;
	let plan = saved.plan;
	for (const op of operations) {
		if (op.type === 'plan' || op.type === 'unplan') {
			const mealId = op.type === 'plan' ? op.meal_id : null;
			plan = [...plan.filter((day) => day.date !== op.date), { date: op.date, mealId }];
			continue;
		}
		if (op.type === 'add_meal')
			result = [...result, { id: op.meal_id, name: op.name, ingredients: op.ingredients, saving: true }];
		else if (op.type === 'edit_meal')
			result = result.map((m) =>
				m.id === op.meal_id ? { ...m, name: op.name, ingredients: op.ingredients, saving: true } : m
			);
		else result = result.filter((m) => m.id !== op.meal_id);
	}
	return { meals: result, plan };
}
