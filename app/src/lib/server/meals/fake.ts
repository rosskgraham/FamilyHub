import type { Meal, MealChange, PlanDay } from '#lib/meals.ts';
import { addDays, dayKey } from '#lib/time.ts';
import { now } from '../now.ts';

// Sample meals kept in memory, so adding, editing and removing can be tried without the backend. They reset when
// the app restarts.
export interface MealsSource {
	list(): Promise<{ meals: Meal[]; plan: PlanDay[] }>;
	apply(change: MealChange): Promise<void>;
}

let nextId = 1;
const meal = (name: string, ingredients: string[]): Meal => ({
	id: `sample-meal-${nextId++}`,
	name,
	ingredients,
	saving: false
});

const meals: Meal[] = [
	meal('Chicken curry', ['chicken thighs', 'onions', 'curry paste', 'coconut milk', 'rice', 'naan']),
	meal('Chilli con carne', [
		'beef mince',
		'kidney beans',
		'chopped tomatoes',
		'onions',
		'peppers',
		'rice',
		'sour cream',
		'cheddar'
	]),
	meal('Fajitas', ['chicken breasts', 'peppers', 'onions', 'wraps', 'fajita seasoning', 'salsa', 'sour cream']),
	meal('Fish pie', ['fish pie mix', 'potatoes', 'milk', 'butter', 'peas', 'cheddar']),
	meal('Lasagne', ['beef mince', 'lasagne sheets', 'passata', 'onions', 'carrots', 'milk', 'cheddar']),
	meal('Pasta bake', ['penne', 'passata', 'mozzarella', 'peppers', 'sweetcorn']),
	meal('Roast chicken', ['whole chicken', 'potatoes', 'carrots', 'broccoli', 'gravy granules', 'stuffing']),
	meal('Sausage and mash', ['sausages', 'potatoes', 'peas', 'gravy granules', 'butter']),
	meal('Shepherd’s pie', ['lamb mince', 'potatoes', 'onions', 'carrots', 'peas', 'stock cubes']),
	meal('Spaghetti bolognese', ['beef mince', 'spaghetti', 'chopped tomatoes', 'onions', 'garlic', 'parmesan']),
	meal('Stir fry', ['noodles', 'stir fry veg', 'chicken breasts', 'soy sauce']),
	meal('Takeaway', [])
];

// Sample dinners from today on, as on the mockup's board A: changed by planning, kept until the app restarts.
const planned = new Map<number, string>([
	[0, 'Fajitas'],
	[1, 'Takeaway'],
	[2, 'Chilli con carne'],
	[4, 'Spaghetti bolognese'],
	[5, 'Fish pie']
]);
let plan: Map<string, string | null> | null = null;
let planFrom: string | null = null;

/** The sample plan, started from whichever day the Hub first asks on. */
function samplePlan(): Map<string, string | null> {
	const today = dayKey(now());
	if (!plan || planFrom !== today) {
		planFrom = today;
		plan = new Map(
			[...planned].map(([offset, name]) => [addDays(today, offset), meals.find((m) => m.name === name)?.id ?? null])
		);
	}
	return plan;
}

export const fakeMeals: MealsSource = {
	async list() {
		return {
			meals: meals.map((m) => ({ ...m, ingredients: [...m.ingredients] })),
			plan: [...samplePlan()].map(([date, mealId]) => ({ date, mealId }))
		};
	},
	async apply(change) {
		switch (change.action) {
			case 'add': {
				const added = meal(change.name, change.ingredients);
				meals.push(added);
				if (change.planFor) samplePlan().set(change.planFor, added.id);
				return;
			}
			case 'plan':
				samplePlan().set(change.date, change.mealId);
				return;
			case 'unplan':
				samplePlan().set(change.date, null);
				return;
		}
		const index = meals.findIndex((m) => m.id === change.id);
		if (index < 0) return;
		if (change.action === 'remove') meals.splice(index, 1);
		else meals[index] = { ...meals[index]!, name: change.name, ingredients: change.ingredients };
	}
};
