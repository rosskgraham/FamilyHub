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
	CALENDAR_SOURCE: {
		description: 'Set to `sample` to show sample Events even when Google is set up.',
		schema: (value) => (value === 'sample' ? 'sample' : undefined)
	}
});
