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
	OCTOPUS_AGILE_PRODUCT: {
		description: 'The Household’s Octopus Agile product, such as AGILE-24-10-01. Without it and OCTOPUS_REGION the Hub shows sample rates.',
		schema: optional
	},
	OCTOPUS_REGION: {
		description: 'The letter, A to P, of home’s electricity region, for its Agile rates. Personal, as it gives away roughly where home is.',
		schema: (value) => (value && /^[A-P]$/.test(value) ? value : undefined)
	},
	HUB_NOW: {
		description: 'Pretend it is this moment (an ISO time) on the server. Only for the screenshot tests.',
		schema: optional
	},
	CALENDAR_SOURCE: {
		description: 'Set to `sample` to show sample Events, a sample Shopping list, sample weather and sample Agile rates even when Google, home and Octopus are set up.',
		schema: (value) => (value === 'sample' ? 'sample' : undefined)
	}
});
