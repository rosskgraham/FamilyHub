import { describe, expect, it } from 'vitest';
import { byName, dinnerOn, mealDetail, plannedFrom, weekFrom, type Meal } from './meals.ts';

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

describe('the week of dinners', () => {
	it('is today and the next 6 days, labelled Tonight, Tomorrow, then by weekday and date', () => {
		expect(weekFrom('2026-11-27')).toEqual([
			{ date: '2026-11-27', label: 'Tonight', detail: 'Fri 27 Nov' },
			{ date: '2026-11-28', label: 'Tomorrow', detail: 'Sat 28 Nov' },
			{ date: '2026-11-29', label: 'Sunday', detail: '29 Nov' },
			{ date: '2026-11-30', label: 'Monday', detail: '30 Nov' },
			{ date: '2026-12-01', label: 'Tuesday', detail: '1 Dec' },
			{ date: '2026-12-02', label: 'Wednesday', detail: '2 Dec' },
			{ date: '2026-12-03', label: 'Thursday', detail: '3 Dec' }
		]);
	});

	it('moves on a day at midnight: yesterday drops off and a new seventh day appears', () => {
		const before = weekFrom('2026-11-27').map((d) => d.date);
		const after = weekFrom('2026-11-28').map((d) => d.date);
		expect(after.slice(0, 6)).toEqual(before.slice(1));
		expect(after).not.toContain('2026-11-27');
		expect(after.at(-1)).toBe('2026-12-04');
		expect(weekFrom('2026-11-28')[0]!.label).toBe('Tonight');
	});

	it('crosses a clock change and a new year without skipping a day', () => {
		expect(weekFrom('2026-10-23').map((d) => d.date)).toContain('2026-10-25');
		expect(
			weekFrom('2026-12-29')
				.map((d) => d.date)
				.slice(2, 4)
		).toEqual(['2026-12-31', '2027-01-01']);
	});
});

describe('dinnerOn', () => {
	const fajitas: Meal = { id: 'fajitas', name: 'Fajitas', ingredients: [], saving: false };
	const plan = [
		{ date: '2026-11-27', mealId: 'fajitas' },
		{ date: '2026-11-28', mealId: 'removed-meal' },
		{ date: '2026-11-29', mealId: null }
	];

	it('gives the meal planned for a date', () => {
		expect(dinnerOn('2026-11-27', plan, [fajitas])).toBe(fajitas);
	});

	it('gives nothing for a day planned with a meal that’s since been removed, unplanned, or never planned', () => {
		expect(dinnerOn('2026-11-28', plan, [fajitas])).toBeNull();
		expect(dinnerOn('2026-11-29', plan, [fajitas])).toBeNull();
		expect(dinnerOn('2026-11-30', plan, [fajitas])).toBeNull();
	});
});
