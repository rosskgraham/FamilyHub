import { readFileSync } from 'node:fs';
import { createPublicKey, verify, X509Certificate } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendClient, backendSettings, BackendSignInRefused, clientAssertion, type BackendSettings } from './auth.ts';

const pem = readFileSync(new URL('./test-certificate.pem', import.meta.url), 'utf8');

const settings: BackendSettings = {
	url: 'https://func-familyhub-test.azurewebsites.net',
	tenantId: 'tenant-1',
	subdomain: 'familyhubtest',
	apiClientId: 'api-1',
	hubClientId: 'hub-1',
	certificate: Buffer.from(pem).toString('base64')
};
const TOKEN_URL = 'https://familyhubtest.ciamlogin.com/tenant-1/oauth2/v2.0/token';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** A pretend tenant and backend: tokens from the tenant, and the backend's answers in turn. */
function fake(
	backend: Response[],
	token: () => Response = () => json(200, { access_token: 'token-1', expires_in: 3600 })
) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init! });
		return String(url) === TOKEN_URL ? token() : backend.shift()!;
	}) as unknown as typeof fetch;
	const tokenRequests = () => calls.filter((c) => c.url === TOKEN_URL);
	return { fetcher, calls, tokenRequests };
}

afterEach(() => vi.useRealTimers());

describe('backendSettings', () => {
	const env = {
		BACKEND_URL: 'https://func-familyhub-test.azurewebsites.net/',
		ENTRA_TENANT_ID: 'tenant-1',
		ENTRA_SUBDOMAIN: 'familyhubtest',
		BACKEND_API_CLIENT_ID: 'api-1',
		HUB_CLIENT_ID: 'hub-1',
		HUB_CERTIFICATE: settings.certificate
	};

	it('reads all six, without a trailing slash on the address', () => {
		expect(backendSettings(env)).toEqual(settings);
	});

	it.each(Object.keys(env))('is null without %s, so the Hub doesn’t try to sign in', (name) => {
		expect(backendSettings({ ...env, [name]: undefined })).toBeNull();
	});
});

describe('clientAssertion', () => {
	it('is a JWT for the tenant’s token endpoint, from the Hub, signed with the certificate', () => {
		const now = Date.UTC(2026, 10, 24, 12);
		const [header, claims, signature] = clientAssertion(settings, TOKEN_URL, now).split('.');
		const der = new X509Certificate(pem.slice(pem.indexOf('-----BEGIN CERTIFICATE'))).raw;

		expect(decode(header!)).toMatchObject({ alg: 'RS256', typ: 'JWT' });
		expect(Buffer.from(decode(header!)['x5t#S256'], 'base64url')).toHaveLength(32);
		expect(decode(header!).x5t).toBe(
			Buffer.from(new X509Certificate(der).fingerprint.replaceAll(':', ''), 'hex').toString('base64url')
		);
		expect(decode(claims!)).toMatchObject({ aud: TOKEN_URL, iss: 'hub-1', sub: 'hub-1', iat: now / 1000 });
		expect(decode(claims!).exp - decode(claims!).iat).toBe(600);
		const key = createPublicKey(new X509Certificate(der).publicKey.export({ type: 'spki', format: 'pem' }));
		expect(verify('sha256', Buffer.from(`${header}.${claims}`), key, Buffer.from(signature!, 'base64url'))).toBe(true);
	});

	it('says what’s wrong with a certificate that isn’t a PEM key and certificate, without showing it', () => {
		const broken = { ...settings, certificate: Buffer.from('not a certificate').toString('base64') };
		expect(() => clientAssertion(broken, TOKEN_URL)).toThrow(
			'HUB_CERTIFICATE is not a PEM private key and certificate, base64'
		);
	});
});

describe('backendClient', () => {
	it('gets an app-only token for the API with the certificate, and calls the backend with it', async () => {
		const { fetcher, calls } = fake([json(200, { kind: 'hub', member_id: null })]);

		expect(await backendClient(settings, fetcher).request('GET', '/me')).toEqual({ kind: 'hub', member_id: null });

		const form = new URLSearchParams(String(calls[0]!.init.body));
		expect(calls[0]!.url).toBe(TOKEN_URL);
		expect(Object.fromEntries(form)).toMatchObject({
			client_id: 'hub-1',
			scope: 'api://api-1/.default',
			grant_type: 'client_credentials',
			client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
		});
		expect(form.get('client_assertion')!.split('.')).toHaveLength(3);
		expect(calls[1]!.url).toBe('https://func-familyhub-test.azurewebsites.net/me');
		expect(calls[1]!.init.headers).toEqual({ authorization: 'Bearer token-1' });
	});

	it('sends a body as JSON', async () => {
		const { fetcher, calls } = fake([json(200, { results: [] })]);
		await backendClient(settings, fetcher).request('POST', '/lists/shopping/operations', { operations: [] });
		expect(calls[1]!.init).toMatchObject({
			method: 'POST',
			headers: { authorization: 'Bearer token-1', 'content-type': 'application/json' },
			body: '{"operations":[]}'
		});
	});

	it('reuses the token until it’s within five minutes of expiring, then gets a new one', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(Date.UTC(2026, 10, 24, 12));
		const { fetcher, tokenRequests } = fake([json(200, {}), json(200, {}), json(200, {})]);
		const api = backendClient(settings, fetcher);

		await api.request('GET', '/me');
		vi.setSystemTime(Date.UTC(2026, 10, 24, 12, 54));
		await api.request('GET', '/me');
		expect(tokenRequests()).toHaveLength(1);

		vi.setSystemTime(Date.UTC(2026, 10, 24, 12, 56));
		await api.request('GET', '/me');
		expect(tokenRequests()).toHaveLength(2);
	});

	it('gets a new token once if the backend turns one down, then carries on', async () => {
		const { fetcher, tokenRequests } = fake([json(401, {}), json(200, { kind: 'hub' })]);
		expect(await backendClient(settings, fetcher).request('GET', '/me')).toEqual({ kind: 'hub' });
		expect(tokenRequests()).toHaveLength(2);
	});

	it.each([
		['the backend still turns down a new token', [json(401, {}), json(401, {})]],
		['the backend says the Hub isn’t allowed', [json(403, {})]]
	])('says the sign-in was refused when %s', async (_, answers) => {
		const { fetcher } = fake(answers);
		await expect(backendClient(settings, fetcher).request('GET', '/me')).rejects.toBeInstanceOf(BackendSignInRefused);
	});

	it('says the sign-in was refused when the tenant won’t take the certificate, with its reason and no secrets', async () => {
		const { fetcher } = fake([], () =>
			json(401, { error: 'invalid_client', error_codes: [700027], error_description: 'AADSTS700027: …' })
		);
		const refused = backendClient(settings, fetcher).request('GET', '/me');
		await expect(refused).rejects.toBeInstanceOf(BackendSignInRefused);
		await expect(refused).rejects.toThrow('Backend sign-in refused: 401 invalid_client 700027');
	});

	it('treats the tenant or backend being down as a failure to try again, not a refusal', async () => {
		const down = fake([], () => json(503, {}));
		const failed = backendClient(settings, down.fetcher).request('GET', '/me');
		await expect(failed).rejects.toThrow('Backend sign-in failed: 503');
		await expect(failed).rejects.not.toBeInstanceOf(BackendSignInRefused);

		const { fetcher } = fake([json(503, {})]);
		const busy = backendClient(settings, fetcher).request('GET', '/me');
		await expect(busy).rejects.toThrow('Backend request failed, GET /me: 503');
		await expect(busy).rejects.not.toBeInstanceOf(BackendSignInRefused);
	});
});
