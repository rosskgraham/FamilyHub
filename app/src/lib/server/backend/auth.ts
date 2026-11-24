// The Hub signs in to the family app's backend as itself (ADR 0010): an app-only token from the FamilyHub tenant, got
// with the certificate of the FamilyHub Hub app registration. The Hub signs its own client assertion, so it needs no
// MSAL: the client credentials flow with a certificate is one request.
import { createHash, createPrivateKey, randomUUID, sign, X509Certificate, type KeyObject } from 'node:crypto';

/** Where the backend is and who the Hub is to it. The values are in the Key Vault; see the sign-in runbook. */
export interface BackendSettings {
	/** The function app, such as https://func-familyhub-xxxxxx.azurewebsites.net. */
	url: string;
	tenantId: string;
	/** As in <subdomain>.ciamlogin.com. */
	subdomain: string;
	/** The FamilyHub API registration's client ID, which the token is for. */
	apiClientId: string;
	/** The FamilyHub Hub registration's client ID. */
	hubClientId: string;
	/** Base64 of the PEM the Key Vault keeps: the private key and its certificate. */
	certificate: string;
}

/** The settings, or null if any is missing, as before the Hub is set up for the backend. */
export function backendSettings(env: Record<string, string | undefined>): BackendSettings | null {
	const settings = {
		url: env.BACKEND_URL?.replace(/\/+$/, ''),
		tenantId: env.ENTRA_TENANT_ID,
		subdomain: env.ENTRA_SUBDOMAIN,
		apiClientId: env.BACKEND_API_CLIENT_ID,
		hubClientId: env.HUB_CLIENT_ID,
		certificate: env.HUB_CERTIFICATE
	};
	return Object.values(settings).every(Boolean) ? (settings as BackendSettings) : null;
}

/**
 * The backend or the FamilyHub tenant won't take the Hub's sign-in: the certificate has expired, been removed from
 * FamilyHub Hub, or doesn't match it. Nothing on the Hub can fix that, so lists that use the backend say Offline.
 */
export class BackendSignInRefused extends Error {}

// A request that hangs is as good as none, and holds up the page while it waits.
const TIMEOUT_MS = 10_000;
// Renew a few minutes early, so a token never expires mid-request.
const EARLY_MS = 5 * 60_000;

const base64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

interface Certificate {
	key: KeyObject;
	/** The certificate's SHA-256 and SHA-1 thumbprints, by which Entra finds the public half it was given. */
	x5tS256: string;
	x5t: string;
}

function readCertificate(certificate: string): Certificate {
	const pem = Buffer.from(certificate, 'base64').toString('utf8');
	const keyPem = pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)?.[0];
	const certPem = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
	if (!keyPem || !certPem) throw new Error('HUB_CERTIFICATE is not a PEM private key and certificate, base64');
	const der = new X509Certificate(certPem).raw;
	return {
		key: createPrivateKey(keyPem),
		x5tS256: base64url(createHash('sha256').update(der).digest()),
		x5t: base64url(createHash('sha1').update(der).digest())
	};
}

/** A JWT signed with the certificate, proving to the tenant it's the Hub asking. */
export function clientAssertion(settings: BackendSettings, tokenUrl: string, now = Date.now()): string {
	const { key, x5tS256, x5t } = readCertificate(settings.certificate);
	const seconds = Math.floor(now / 1000);
	const header = { alg: 'RS256', typ: 'JWT', 'x5t#S256': x5tS256, x5t };
	const claims = {
		aud: tokenUrl,
		iss: settings.hubClientId,
		sub: settings.hubClientId,
		jti: randomUUID(),
		iat: seconds,
		nbf: seconds,
		exp: seconds + 600
	};
	const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
	return `${unsigned}.${base64url(sign('sha256', Buffer.from(unsigned), key))}`;
}

export type BackendRequest = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>;

export interface BackendClient {
	/** Calls the backend as the Hub. Throws BackendSignInRefused if it won't take the Hub's sign-in. */
	request: BackendRequest;
}

export function backendClient(settings: BackendSettings, fetcher: typeof fetch = fetch): BackendClient {
	const tokenUrl = `https://${settings.subdomain}.ciamlogin.com/${settings.tenantId}/oauth2/v2.0/token`;
	let cached: { token: string; expiresAt: number } | null = null;

	async function accessToken(): Promise<string> {
		if (cached && cached.expiresAt > Date.now()) return cached.token;
		const response = await fetcher(tokenUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: settings.hubClientId,
				scope: `api://${settings.apiClientId}/.default`,
				grant_type: 'client_credentials',
				client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
				client_assertion: clientAssertion(settings, tokenUrl)
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		const body = (await response.json().catch(() => ({}))) as {
			access_token?: string;
			expires_in?: number;
			error?: string;
			error_codes?: number[];
		};
		if (response.ok && body.access_token) {
			cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 0) * 1000 - EARLY_MS };
			return body.access_token;
		}
		// Entra's error and its AADSTS codes say why, such as 700027 for a certificate it doesn't know. No token or
		// assertion is in them.
		const why = `${response.status} ${body.error ?? ''} ${body.error_codes?.join(',') ?? ''}`.trim();
		if (response.status === 400 || response.status === 401)
			throw new BackendSignInRefused(`Backend sign-in refused: ${why}`);
		throw new Error(`Backend sign-in failed: ${why}`);
	}

	return {
		async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
			for (let attempt = 0; ; attempt++) {
				const headers: Record<string, string> = { authorization: `Bearer ${await accessToken()}` };
				if (body !== undefined) headers['content-type'] = 'application/json';
				const response = await fetcher(`${settings.url}${path}`, {
					method,
					headers,
					body: body === undefined ? undefined : JSON.stringify(body),
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});
				if (response.ok) return (await response.json()) as T;
				// A token the backend no longer accepts: forget it and try once more with a new one.
				if (response.status === 401 && attempt === 0) {
					cached = null;
					continue;
				}
				if (response.status === 401 || response.status === 403)
					throw new BackendSignInRefused(`Backend refused the Hub: ${method} ${path}: ${response.status}`);
				throw new Error(`Backend request failed, ${method} ${path}: ${response.status}`);
			}
		}
	};
}
