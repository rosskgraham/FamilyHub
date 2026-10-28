import { fail, redirect } from '@sveltejs/kit';
import { EVERYONE, type Owner, type OwnerId } from '#lib/household.ts';
import { isConfigured, isSignedIn, SignInNeeded, signOut } from '#lib/server/google/auth.ts';
import { listCalendars, type GoogleCalendar } from '#lib/server/calendar/google.ts';
import { configuredHousehold } from '#lib/server/household.ts';
import { listTaskLists, type GoogleTaskList } from '#lib/server/shopping/google.ts';
import { readSettings, writeSettings } from '#lib/server/settings.ts';
import type { Actions, PageServerLoad } from './$types';

// A first guess at who each Calendar belongs to, from its name.
function guess(owner: Owner, isFirst: boolean, calendars: GoogleCalendar[]): string {
	const word = owner.id === EVERYONE ? 'family' : owner.name.toLowerCase();
	const match = calendars.find((c) => c.summary.toLowerCase().includes(word));
	if (match) return match.id;
	// The first Member is usually whoever signed in, so the account's main Calendar is a good guess.
	if (isFirst) return calendars.find((c) => c.primary)?.id ?? '';
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
	const { household, fromFile } = await configuredHousehold();
	const choices = Object.values(household).map((owner, i) => ({
		owner,
		calendarId: settings.calendars[owner.id] ?? guess(owner, i === 0, calendars)
	}));
	const shoppingList =
		settings.shoppingList ?? taskLists.find((l) => l.title.toLowerCase().includes('shopping'))?.id ?? '';
	return {
		step: 'calendars' as const,
		problem,
		householdFromFile: fromFile,
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
		const { household } = await configuredHousehold();
		const calendars: Record<OwnerId, string> = {};
		for (const id of Object.keys(household)) {
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
