import { describe, expect, it } from 'vitest';
import { byName, mealDetail, plannedFrom, type Meal } from './meals.ts';

const meal = (name: string): Meal => ({ id: name, name, ingredients: [], saving: false });

describe('the saved meals', () => {
	it('sort A–Z, ignoring case and accents', () => {
		const names = ['stir fry', 'Chilli con carne', 'Éclairs', 'chicken curry', 'Takeaway'].map(meal);
		expect(names.sort(byName).map((m) => m.name)).toEqual([
			'chicken curry',
			'Chilli con carne',
			'Éclairs',
			'stir fry',
			'Takeaway'
		]);
	});

	it('say how many ingredients and the first three, or that there are none', () => {
		expect(mealDetail(['chicken thighs', 'onions', 'curry paste', 'coconut milk', 'rice', 'naan'])).toBe(
			'6 ingredients · chicken thighs, onions, curry paste…'
		);
		expect(mealDetail(['noodles', 'stir fry veg', 'soy sauce'])).toBe(
			'3 ingredients · noodles, stir fry veg, soy sauce'
		);
		expect(mealDetail(['bread'])).toBe('1 ingredient · bread');
		expect(mealDetail([])).toBe('No ingredients');
	});
});

describe('plannedFrom', () => {
	const plan = [
		{ date: '2026-11-25', mealId: 'curry' },
		{ date: '2026-12-01', mealId: 'curry' },
		{ date: '2026-11-30', mealId: 'curry' },
		{ date: '2026-11-29', mealId: 'pasta' },
		{ date: '2026-11-28', mealId: null }
	];

	it('finds the first day from today a meal is planned for, not one already past', () => {
		expect(plannedFrom(plan, 'curry', '2026-11-28')).toBe('2026-11-30');
		expect(plannedFrom(plan, 'pasta', '2026-11-29')).toBe('2026-11-29');
		expect(plannedFrom(plan, 'pasta', '2026-11-30')).toBeNull();
		expect(plannedFrom(plan, 'fajitas', '2026-11-28')).toBeNull();
	});
});
