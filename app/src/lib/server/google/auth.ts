import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { readJson, remove, writeJson } from '../store.ts';

// Read Calendars, never change them; read and change the Shopping list.
const SCOPES = [
	'https://www.googleapis.com/auth/calendar.readonly',
	'https://www.googleapis.com/auth/tasks'
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_FILE = 'google-token.json';
// A request that hangs is as good as none, and holds up the page while it waits.
const TIMEOUT_MS = 10_000;

/** Google has ended the Hub's sign-in, or it never signed in. */
export class SignInNeeded extends Error {
	constructor() {
		super('Google sign-in needed');
	}
}

/** Google answered, but turned the request down, for example because the item is gone. Trying again won't help. */
export class GoogleRefused extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

interface StoredToken {
	refreshToken: string;
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
}

let cached: { token: string; expiresAt: number } | null = null;

function client(): { id: string; secret: string } | null {
	const id = GOOGLE_CLIENT_ID;
	const secret = GOOGLE_CLIENT_SECRET;
	return id && secret ? { id, secret } : null;
}

export function isConfigured(): boolean {
	return client() !== null;
}

export async function isSignedIn(): Promise<boolean> {
	return (await readJson<StoredToken>(TOKEN_FILE)) !== null;
}

export function signInUrl(redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		client_id: client()!.id,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: SCOPES.join(' '),
		state,
		// Offline access and a fresh consent so Google always returns a refresh token.
		access_type: 'offline',
		prompt: 'consent'
	});
	return `${AUTH_URL}?${params}`;
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
	const { id, secret } = client()!;
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (response.ok) return (await response.json()) as TokenResponse;
	const problem = (await response.json().catch(() => ({}))) as { error?: string };
	if (problem.error === 'invalid_grant') throw new SignInNeeded();
	throw new Error(`Google token request failed: ${response.status} ${problem.error ?? ''}`.trim());
}

function remember(response: TokenResponse): string {
	// Renew a minute early so a token never expires mid-request.
	cached = { token: response.access_token, expiresAt: Date.now() + (response.expires_in - 60) * 1000 };
	return response.access_token;
}

export async function completeSignIn(code: string, redirectUri: string): Promise<void> {
	const response = await requestToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
	if (!response.refresh_token) throw new Error('Google did not return a refresh token');
	await writeJson(TOKEN_FILE, { refreshToken: response.refresh_token } satisfies StoredToken);
	remember(response);
}

export async function signOut(): Promise<void> {
	cached = null;
	await remove(TOKEN_FILE);
}

async function accessToken(): Promise<string> {
	if (cached && cached.expiresAt > Date.now()) return cached.token;
	const stored = await readJson<StoredToken>(TOKEN_FILE);
	if (!stored || !client()) throw new SignInNeeded();
	return remember(await requestToken({ grant_type: 'refresh_token', refresh_token: stored.refreshToken }));
}

/** Call a Google API, signed in as the Household. Resolves to undefined for an empty response. */
export async function googleRequest<T>(
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	url: string,
	body?: unknown
): Promise<T> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const headers: Record<string, string> = { authorization: `Bearer ${await accessToken()}` };
		if (body !== undefined) headers['content-type'] = 'application/json';
		const response = await fetch(url, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
		// An access token Google no longer accepts: forget it and try once more.
		if (response.status === 401 && attempt === 0) {
			cached = null;
			continue;
		}
		const message = `Google API request failed: ${response.status} ${method} ${url.split('?')[0]}`;
		// 408 and 429 mean try later, like a server error.
		if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
			throw new GoogleRefused(response.status, message);
		}
		throw new Error(message);
	}
	throw new SignInNeeded();
}

export function googleGet<T>(url: string): Promise<T> {
	return googleRequest<T>('GET', url);
}
