// The app's settings, built in by the pipeline from the familyhub variable group and the Bicep's outputs (AB#56).
// None is secret: they say where to sign in and which API to call. Set them in family-app/.env to run against the
// real tenant on the PC (see README.md).

export interface Config {
	tenantId: string;
	/** As in <subdomain>.ciamlogin.com. */
	subdomain: string;
	/** The FamilyHub app registration. */
	appClientId: string;
	/** The FamilyHub API registration: its scope is what the app asks for. */
	apiClientId: string;
	/** The backend, such as https://func-familyhub-xxxxxx.azurewebsites.net. */
	apiUrl: string;
}

type Env = Record<string, string | undefined>;

/**
 * A setting's value. Azure DevOps leaves $(NAME) in place when a variable isn't in the group, so that counts as
 * missing too.
 */
function setting(value: string | undefined): string {
	const trimmed = value?.trim() ?? '';
	return trimmed.startsWith('$(') ? '' : trimmed;
}

/** The settings, or null when any is missing, as before the sign-in runbook is done. */
export function readConfig(env: Env = import.meta.env): Config | null {
	const config = {
		tenantId: setting(env.VITE_FAMILYHUB_ENTRA_TENANT_ID),
		subdomain: setting(env.VITE_FAMILYHUB_ENTRA_SUBDOMAIN),
		appClientId: setting(env.VITE_FAMILYHUB_APP_CLIENT_ID),
		apiClientId: setting(env.VITE_FAMILYHUB_API_CLIENT_ID),
		apiUrl: setting(env.VITE_FAMILYHUB_API_URL).replace(/\/+$/, '')
	};
	return Object.values(config).every(Boolean) ? config : null;
}
