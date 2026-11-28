import type { Meal, MealChange, PlanDay } from '#lib/meals.ts';
import { addDays, dayKey } from '#lib/time.ts';
import { now } from '../now.ts';

// Sample meals kept in memory, so adding, editing and removing can be tried without the backend. They reset when
// the app restarts. Planning comes with AB#99; until then the sample plans one meal, two days on.
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

export const fakeMeals: MealsSource = {
	async list() {
		const chilli = meals.find((m) => m.name === 'Chilli con carne');
		const plan: PlanDay[] = chilli ? [{ date: addDays(dayKey(now()), 2), mealId: chilli.id }] : [];
		return { meals: meals.map((m) => ({ ...m, ingredients: [...m.ingredients] })), plan };
	},
	async apply(change) {
		if (change.action === 'add') {
			meals.push(meal(change.name, change.ingredients));
			return;
		}
		const index = meals.findIndex((m) => m.id === change.id);
		if (index < 0) return;
		if (change.action === 'remove') meals.splice(index, 1);
		else meals[index] = { ...meals[index]!, name: change.name, ingredients: change.ingredients };
	}
};
