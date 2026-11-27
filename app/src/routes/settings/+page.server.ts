import { fail, redirect } from '@sveltejs/kit';
import { EVERYONE } from '#lib/household.ts';
import { readBackupStatus } from '#lib/server/backup/index.ts';
import { listCalendars, type GoogleCalendar } from '#lib/server/calendar/google.ts';
import { isConfigured, isSignedIn, SignInNeeded, signOut } from '#lib/server/google/auth.ts';
import {
	addMember,
	householdConfig,
	HouseholdError,
	removeMember,
	setEveryoneColour,
	updateMember
} from '#lib/server/household.ts';
import { disconnectNest, isNestConnected, loadHeating, nestConfigured } from '#lib/server/nest/index.ts';
import { hubNetwork } from '#lib/server/network.ts';
import { piTemperature } from '#lib/server/pi-temperature.ts';
import { readSettings, readSleepHours, writeSettings, type Settings } from '#lib/server/settings.ts';
import { sleepTimes, STEP_MINUTES, stepHours, type SleepTime } from '#lib/sleep.ts';
import { serverStartedAt } from '#lib/server/started.ts';
import { listTaskLists, type GoogleTaskList } from '#lib/server/tasks/google.ts';
import { themeChoices, type ThemeChoice } from '#lib/theme.ts';
import { clockFormats, type ClockFormat } from '#lib/time.ts';
import type { Actions, PageServerLoad } from './$types';

// Settings, including the Household and Google, which used to be the setup page (ADR 0012). The layout already gives
// every page the clock format and the theme chosen.

type Google =
	| { step: 'credentials' }
	| { step: 'sign-in' }
	| { step: 'ready'; calendars: GoogleCalendar[]; taskLists: GoogleTaskList[] }
	| { step: 'unreachable' };

async function google(): Promise<{ google: Google; ended: boolean }> {
	if (!isConfigured()) return { google: { step: 'credentials' }, ended: false };
	if (!(await isSignedIn())) return { google: { step: 'sign-in' }, ended: false };
	try {
		const [calendars, taskLists] = await Promise.all([listCalendars(), listTaskLists()]);
		return { google: { step: 'ready', calendars, taskLists }, ended: false };
	} catch (e) {
		if (e instanceof SignInNeeded) return { google: { step: 'sign-in' }, ended: true };
		// Offline: the Household can still be changed, but not which Calendars and lists are whose.
		return { google: { step: 'unreachable' }, ended: false };
	}
}

type Nest =
	// No Google client: there's nothing to connect with.
	{ step: 'hidden' } | { step: 'project' } | { step: 'connect' } | { step: 'connected'; ended: boolean };

async function nest(): Promise<Nest> {
	if (!isConfigured()) return { step: 'hidden' };
	if (!nestConfigured()) return { step: 'project' };
	if (!(await isNestConnected())) return { step: 'connect' };
	const heating = await loadHeating();
	return { step: 'connected', ended: !!heating && !heating.reporting && !!heating.signInEnded };
}

export const load: PageServerLoad = async ({ url }) => {
	const [{ google: g, ended }, settings, backup, n, network] = await Promise.all([
		google(),
		readSettings(),
		readBackupStatus(),
		nest(),
		hubNetwork()
	]);
	return {
		server: {
			startedAt: serverStartedAt().toISOString(),
			node: process.version,
			temperature: piTemperature(),
			network
		},
		household: householdConfig(),
		choices: {
			calendars: settings.calendars,
			todoList: settings.todoList ?? '',
			birthdays: settings.birthdays ?? ''
		},
		google: g,
		nest: n,
		problem: ended ? 'ended' : url.searchParams.get('problem'),
		backup
	};
};

const text = (form: FormData, name: string) => {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
};

/** Saves one Calendar choice, leaving the others. An empty one means "Not shown". */
async function chooseCalendar(id: string, calendar: string) {
	const settings = await readSettings();
	const calendars = { ...settings.calendars };
	if (calendar) calendars[id] = calendar;
	else delete calendars[id];
	await writeSettings({ ...settings, calendars });
}

/** Runs a change to the Household, turning what a grown-up can fix into a message beside the form. */
async function household(form: string, change: () => void | Promise<void>) {
	try {
		await change();
		return { saved: form };
	} catch (e) {
		if (e instanceof HouseholdError) return fail(400, { form, message: e.message });
		throw e;
	}
}

export const actions = {
	clock: async ({ request }) => {
		const chosen = (await request.formData()).get('clockFormat');
		if (!clockFormats.includes(chosen as ClockFormat))
			return fail(400, { form: 'clock', message: 'Choose 24-hour or 12-hour.' });
		await writeSettings({ ...(await readSettings()), clockFormat: chosen as ClockFormat });
	},
	theme: async ({ request }) => {
		const chosen = (await request.formData()).get('theme');
		if (!themeChoices.includes(chosen as ThemeChoice))
			return fail(400, { form: 'theme', message: 'Choose Auto, Light or Dark.' });
		await writeSettings({ ...(await readSettings()), theme: chosen as ThemeChoice });
	},
	sleepHours: async ({ request }) => {
		const [time, delta] = String((await request.formData()).get('step')).split(':');
		const valid = sleepTimes.includes(time as SleepTime) && Math.abs(Number(delta)) === STEP_MINUTES;
		const hours = valid && stepHours(await readSleepHours(), time as SleepTime, Number(delta));
		if (!hours) return fail(400, { form: 'sleep', message: 'That time can’t move any further.' });
		await writeSettings({ ...(await readSettings()), sleepHours: hours });
	},
	lightsOut: async ({ request }) => {
		const chosen = (await request.formData()).get('lightsOutOn');
		if (chosen !== 'on' && chosen !== 'off') return fail(400, { form: 'sleep', message: 'Choose On or Off.' });
		await writeSettings({
			...(await readSettings()),
			sleepHours: { ...(await readSleepHours()), lightsOutOn: chosen === 'on' }
		});
	},
	addMember: async ({ request }) => {
		const form = await request.formData();
		return household('add', async () => {
			const id = addMember(text(form, 'name'), text(form, 'colour'));
			if (text(form, 'calendar')) await chooseCalendar(id, text(form, 'calendar'));
		});
	},
	updateMember: async ({ request }) => {
		const form = await request.formData();
		const id = text(form, 'id');
		return household(id, async () => {
			updateMember(id, text(form, 'name'), text(form, 'colour'));
			if (form.has('calendar')) await chooseCalendar(id, text(form, 'calendar'));
		});
	},
	removeMember: async ({ request }) => {
		const id = text(await request.formData(), 'id');
		return household(id, () => removeMember(id));
	},
	family: async ({ request }) => {
		const form = await request.formData();
		return household(EVERYONE, async () => {
			setEveryoneColour(text(form, 'colour'));
			if (form.has('calendar')) await chooseCalendar(EVERYONE, text(form, 'calendar'));
		});
	},
	lists: async ({ request }) => {
		const form = await request.formData();
		const chosen = (name: keyof Settings) => text(form, name) || undefined;
		await writeSettings({
			...(await readSettings()),
			birthdays: chosen('birthdays'),
			todoList: chosen('todoList')
		});
		return { saved: 'lists' };
	},
	signOut: async () => {
		await signOut();
		redirect(303, '/settings');
	},
	disconnectNest: async () => {
		await disconnectNest();
		redirect(303, '/settings');
	}
} satisfies Actions;
