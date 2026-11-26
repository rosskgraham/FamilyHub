import {
	BACKEND_API_CLIENT_ID,
	BACKEND_URL,
	ENTRA_SUBDOMAIN,
	ENTRA_TENANT_ID,
	HUB_CERTIFICATE,
	HUB_CLIENT_ID
} from '$app/env/private';
import { backendClient, backendSettings, type BackendClient } from './auth.ts';

export { BackendRequestFailed, BackendSignInRefused } from './auth.ts';

let client: BackendClient | null | undefined;

/** The backend, signed in as the Hub, or null until the Hub has the backend's settings and its certificate. */
export function backend(): BackendClient | null {
	if (client === undefined) {
		const settings = backendSettings({
			BACKEND_URL,
			ENTRA_TENANT_ID,
			ENTRA_SUBDOMAIN,
			BACKEND_API_CLIENT_ID,
			HUB_CLIENT_ID,
			HUB_CERTIFICATE
		});
		client = settings && backendClient(settings);
	}
	return client;
}

/**
 * Signs in once at startup and asks the backend who it thinks the Hub is, so the log says whether the sign-in works
 * long before anything relies on it. Never throws: the Hub runs the same either way.
 */
export async function checkBackendSignIn(api: BackendClient | null = backend()): Promise<void> {
	if (!api) return;
	try {
		const me = await api.request<{ kind: string }>('GET', '/me');
		if (me.kind === 'hub') console.log('Signed in to the backend as the Hub');
		else console.error(`Backend sign-in: the backend took the Hub for a ${me.kind}`);
	} catch (e) {
		console.error('Backend sign-in check failed:', e instanceof Error ? e.message : e);
	}
}
