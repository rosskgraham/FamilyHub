import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	GOOGLE_CLIENT_ID: {
		description: 'The Hub’s Google OAuth client ID. See docs/runbooks/google-cloud-setup.md.',
		schema: optional
	},
	GOOGLE_CLIENT_SECRET: {
		description: 'The Hub’s Google OAuth client secret. Never commit it.',
		schema: optional
	},
	HOME_LATITUDE: {
		description: 'Where home is, for the weather. Without it and HOME_LONGITUDE the Hub shows sample weather.',
		schema: optional
	},
	HOME_LONGITUDE: {
		description: 'Where home is, for the weather.',
		schema: optional
	},
	HUB_NOW: {
		description: 'Pretend it is this moment (an ISO time) on the server. Only for the screenshot tests.',
		schema: optional
	},
	CALENDAR_SOURCE: {
		description: 'Set to `sample` to show sample Events, a sample Shopping list and sample weather even when Google and home are set up.',
		schema: (value) => (value === 'sample' ? 'sample' : undefined)
	}
});
