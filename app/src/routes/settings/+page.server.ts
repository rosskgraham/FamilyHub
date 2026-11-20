import { fail } from '@sveltejs/kit';
import { readSettings, writeSettings } from '#lib/server/settings.ts';
import { serverStartedAt } from '#lib/server/started.ts';
import { clockFormats, type ClockFormat } from '#lib/time.ts';
import type { Actions, PageServerLoad } from './$types';

// The layout already gives every page the clock format. This page adds what only the server knows about itself.
export const load: PageServerLoad = () => ({
	server: { startedAt: serverStartedAt().toISOString(), node: process.version }
});

export const actions = {
	clock: async ({ request }) => {
		const chosen = (await request.formData()).get('clockFormat');
		if (!clockFormats.includes(chosen as ClockFormat)) return fail(400, { message: 'Choose 24-hour or 12-hour.' });
		await writeSettings({ ...(await readSettings()), clockFormat: chosen as ClockFormat });
	}
} satisfies Actions;
