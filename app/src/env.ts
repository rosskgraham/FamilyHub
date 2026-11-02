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
	OCTOPUS_ACCOUNT: {
		description:
			'The Household’s Octopus account number, such as A-1234ABCD. Without it and OCTOPUS_API_KEY the Hub shows sample rates.',
		schema: optional
	},
	OCTOPUS_API_KEY: {
		description:
			'The Octopus account’s API key, for its rates and Smart-charging slots. It can see the account and its bills: never commit it.',
		schema: optional
	},
	ZAPPI_GLO_SN: {
		description:
			'The Zappi’s serial number, for its usage from myenergi. Without it and ZAPPI_GLO_API_KEY the Hub shows sample usage.',
		schema: optional
	},
	ZAPPI_GLO_API_KEY: {
		description: 'The myenergi account’s API key, from myaccount.myenergi.com. Never commit it.',
		schema: optional
	},
	HUB_DATA_DIR: {
		description:
			'The folder for what the Hub writes itself: the Google sign-in, settings, saved answers and databases. On the Pi, a folder on the data partition outside the releases. Defaults to app/data.',
		schema: optional
	},
	HUB_CONFIG_DIR: {
		description:
			'The folder holding household.json and chores.json. On the Pi, a folder on the data partition outside the releases. Defaults to app.',
		schema: optional
	},
	HUB_NOW: {
		description: 'Pretend it is this moment (an ISO time) on the server. Only for the screenshot tests.',
		schema: optional
	},
	CALENDAR_SOURCE: {
		description:
			'Set to `sample` to show sample Events, a sample Shopping list, sample weather and sample energy even when Google, home and Octopus are set up.',
		schema: (value) => (value === 'sample' ? 'sample' : undefined)
	}
});
