import { error, json } from '@sveltejs/kit';
import { MOST_INGREDIENTS, type MealChange } from '#lib/meals.ts';
import { meals } from '#lib/server/meals/index.ts';
import { MAX_TEXT } from '#lib/server/tasks/route.ts';
import type { RequestHandler } from './$types';

const trimmed = (text: unknown) => (typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '');

/** A meal's name and ingredients as the backend takes them: trimmed, none empty, at most 50 ingredients. */
function named(b: Record<string, unknown>): { name: string; ingredients: string[] } | null {
	const name = trimmed(b.name);
	if (!name || !Array.isArray(b.ingredients) || b.ingredients.length > MOST_INGREDIENTS) return null;
	const ingredients = b.ingredients.map(trimmed);
	return ingredients.every(Boolean) ? { name, ingredients } : null;
}

/** A real date written YYYY-MM-DD, as the backend takes it. */
const isDate = (text: unknown): text is string =>
	typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T12:00:00Z`));

function parse(body: unknown): MealChange | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	if (b.action === 'remove' && typeof b.id === 'string') return { action: 'remove', id: b.id };
	if (b.action === 'plan' && isDate(b.date) && typeof b.mealId === 'string')
		return { action: 'plan', date: b.date, mealId: b.mealId };
	if (b.action === 'unplan' && isDate(b.date)) return { action: 'unplan', date: b.date };
	const meal = named(b);
	if (!meal) return null;
	if (b.action === 'add') {
		if (b.planFor === undefined) return { action: 'add', ...meal };
		return isDate(b.planFor) ? { action: 'add', ...meal, planFor: b.planFor } : null;
	}
	if (b.action === 'edit' && typeof b.id === 'string') return { action: 'edit', id: b.id, ...meal };
	return null;
}

// Adds, edits or removes a saved meal (AB#98), or plans or clears a day's dinner (AB#99). While the backend can't be reached the change waits in the queue, and
// the answer is 202.
export const POST: RequestHandler = async ({ request }) => {
	const change = parse(await request.json().catch(() => null));
	if (!change) error(400, 'Not a meal change');
	return json({ ok: true }, { status: await meals.apply(change) });
};
