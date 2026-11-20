import { fail } from '@sveltejs/kit';
import { readSettings, writeSettings } from '#lib/server/settings.ts';
import { clockFormats, type ClockFormat } from '#lib/time.ts';
import type { Actions } from './$types';

// The layout already gives every page the clock format, so there's nothing more to load.

export const actions = {
	clock: async ({ request }) => {
		const chosen = (await request.formData()).get('clockFormat');
		if (!clockFormats.includes(chosen as ClockFormat)) return fail(400, { message: 'Choose 24-hour or 12-hour.' });
		await writeSettings({ ...(await readSettings()), clockFormat: chosen as ClockFormat });
	}
} satisfies Actions;
