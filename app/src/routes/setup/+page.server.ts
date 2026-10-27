import { fail, redirect } from '@sveltejs/kit';
import { owners, type OwnerId } from '#lib/household.ts';
import { isConfigured, isSignedIn, SignInNeeded, signOut } from '#lib/server/google/auth.ts';
import { listCalendars, type GoogleCalendar } from '#lib/server/calendar/google.ts';
import { listTaskLists, type GoogleTaskList } from '#lib/server/shopping/google.ts';
import { readSettings, writeSettings } from '#lib/server/settings.ts';
import type { Actions, PageServerLoad } from './$types';

const OWNER_IDS = Object.keys(owners) as OwnerId[];

// A first guess at who each Calendar belongs to, from its name.
function guess(owner: OwnerId, calendars: GoogleCalendar[]): string {
	const word = owner === 'everyone' ? 'family' : owners[owner].name.toLowerCase();
	const match = calendars.find((c) => c.summary.toLowerCase().includes(word));
	if (match) return match.id;
	// The account is Alex's, so its main Calendar is a good guess for him.
	if (owner === 'alex') return calendars.find((c) => c.primary)?.id ?? '';
	return '';
}

export const load: PageServerLoad = async ({ url }) => {
	const problem = url.searchParams.get('problem');
	if (!isConfigured()) return { step: 'credentials' as const, problem };
	if (!(await isSignedIn())) return { step: 'sign-in' as const, problem };

	let calendars: GoogleCalendar[];
	let taskLists: GoogleTaskList[];
	try {
		[calendars, taskLists] = await Promise.all([listCalendars(), listTaskLists()]);
	} catch (e) {
		if (e instanceof SignInNeeded) return { step: 'sign-in' as const, problem: 'ended' };
		throw e;
	}
	const settings = await readSettings();
	const choices = OWNER_IDS.map((id) => ({
		owner: owners[id],
		calendarId: settings.calendars[id] ?? guess(id, calendars)
	}));
	const shoppingList =
		settings.shoppingList ?? taskLists.find((l) => l.title.toLowerCase().includes('shopping'))?.id ?? '';
	return {
		step: 'calendars' as const,
		problem,
		calendars,
		choices,
		taskLists,
		shoppingList,
		saved: Object.keys(settings.calendars).length > 0
	};
};

export const actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		const calendars: Partial<Record<OwnerId, string>> = {};
		for (const id of OWNER_IDS) {
			const value = form.get(id);
			if (typeof value === 'string' && value !== '') calendars[id] = value;
		}
		if (Object.keys(calendars).length === 0) return fail(400, { message: 'Choose at least one Calendar.' });
		const list = form.get('shoppingList');
		await writeSettings({ calendars, shoppingList: typeof list === 'string' && list !== '' ? list : undefined });
		redirect(303, '/');
	},
	signOut: async () => {
		await signOut();
		redirect(303, '/setup');
	}
} satisfies Actions;
