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
	NEST_PROJECT_ID: {
		description:
			'The Nest’s Device Access project ID, for the heating. Without it, Settings doesn’t offer to connect the Nest. See docs/runbooks/nest-setup.md.',
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
	BACKEND_URL: {
		description:
			'The family app’s backend, such as https://func-familyhub-xxxxxx.azurewebsites.net. Without it and the five below, the Hub doesn’t sign in to the backend. See docs/runbooks/sign-in-setup.md, step 9.',
		schema: optional
	},
	ENTRA_TENANT_ID: {
		description: 'The FamilyHub tenant’s ID, which the Hub signs in to the backend through.',
		schema: optional
	},
	ENTRA_SUBDOMAIN: {
		description: 'The FamilyHub tenant’s subdomain, as in <subdomain>.ciamlogin.com.',
		schema: optional
	},
	BACKEND_API_CLIENT_ID: {
		description: 'The FamilyHub API registration’s client ID, which the Hub’s token is for.',
		schema: optional
	},
	HUB_CLIENT_ID: {
		description: 'The FamilyHub Hub registration’s client ID: who the Hub is to the backend.',
		schema: optional
	},
	HUB_CERTIFICATE: {
		description:
			'The Hub’s sign-in certificate and its private key, as base64 of the PEM in the Key Vault. Never commit it, print it or paste it in a chat.',
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
	HUB_THERMAL_ZONE: {
		description:
			'The file the Pi’s CPU temperature is read from, for Settings. Defaults to the kernel’s; only the screenshot tests set it.',
		schema: optional
	},
	HUB_NETWORK_FILE: {
		description:
			'A JSON file standing in for the network the Hub is on, for Settings. Unset, the Hub reads its own; only the screenshot tests set it.',
		schema: optional
	},
	HUB_UPDATE_STATUS: {
		description:
			'The updater’s status.json, for Check for updates in Settings. Defaults to the Pi’s, /var/lib/familyhub-update/status.json; only the e2e tests set it.',
		schema: optional
	},
	HUB_UPDATES_AS_RELEASE: {
		description:
			'Set to `true` to offer Check for updates on a development build, as on a release. Only for the e2e tests.',
		schema: (value) => value === 'true'
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
