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

/** Google has ended the Hub's sign-in, or it never signed in. */
export class SignInNeeded extends Error {
	constructor() {
		super('Google sign-in needed');
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
		body: new URLSearchParams({ client_id: id, client_secret: secret, ...body })
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

/** GET a Google API, signed in as the Household. */
export async function googleGet<T>(url: string): Promise<T> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const response = await fetch(url, { headers: { authorization: `Bearer ${await accessToken()}` } });
		if (response.ok) return (await response.json()) as T;
		// An access token Google no longer accepts: forget it and try once more.
		if (response.status === 401 && attempt === 0) {
			cached = null;
			continue;
		}
		throw new Error(`Google API request failed: ${response.status} ${url.split('?')[0]}`);
	}
	throw new SignInNeeded();
}
