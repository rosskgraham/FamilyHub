// What scripts/backend-env.mjs does to app/.env, apart from the Key Vault, so it can be tested.

/** Each variable the Hub signs in to the backend with, and the Key Vault secret it comes from, as on the Pi. */
export const BACKEND_SECRETS: Record<string, string> = {
	BACKEND_URL: 'backend-url',
	ENTRA_TENANT_ID: 'entra-tenant-id',
	ENTRA_SUBDOMAIN: 'entra-subdomain',
	BACKEND_API_CLIENT_ID: 'api-client-id',
	HUB_CLIENT_ID: 'hub-client-id',
	HUB_CERTIFICATE: 'hub-entra-certificate'
};

/** Spans lines, so it goes in as base64 on one, as the playbook puts it in hub.env. */
const BASE64 = new Set(['HUB_CERTIFICATE']);

/**
 * `env`, an .env file's text, with each variable set to its value: changed where it's already set, otherwise added at
 * the end. Everything else is left as it was.
 */
export function withSettings(env: string, values: Record<string, string>): string {
	const lines = env.split(/\r?\n/);
	if (lines.at(-1) === '') lines.pop();
	for (const [name, raw] of Object.entries(values)) {
		const line = `${name}=${BASE64.has(name) ? Buffer.from(raw).toString('base64') : raw}`;
		const at = lines.findIndex((l) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(l));
		if (at === -1) lines.push(line);
		else lines[at] = line;
	}
	return `${lines.join('\n')}\n`;
}
