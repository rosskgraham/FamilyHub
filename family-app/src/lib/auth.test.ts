import { describe, expect, it, vi } from 'vitest';
import { backendAuth, NotTheHousehold, SignInFailed, type Browser } from './auth.ts';
import { readConfig, type Config } from './config.ts';

const CONFIG: Config = {
	tenantId: 'tenant-1',
	subdomain: 'familyhubtest',
	appClientId: 'app-1',
	apiUrl: 'https://api.example'
};
const ORIGIN = 'https://app.example';
const SESSION = 'familyhub.session';

function memory() {
	const stored = new Map<string, string>();
	return {
		stored,
		getItem: (key: string) => stored.get(key) ?? null,
		setItem: (key: string, value: string) => void stored.set(key, value),
		removeItem: (key: string) => void stored.delete(key)
	};
}

function browser(path = '/', search = '') {
	return {
		location: { pathname: path, search },
		go: vi.fn<(url: string) => void>(),
		replace: vi.fn<(path: string) => void>()
	} satisfies Browser;
}

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const MEMBER = {
	kind: 'member',
	token: 'fhs_token-1',
	email: 'ross@example.com',
	object_id: 'oid-1',
	name: 'Ross Graham',
	given_name: 'Ross'
};

function setUp(
	options: { at?: ReturnType<typeof browser>; answer?: () => Promise<Response>; store?: ReturnType<typeof memory> } = {}
) {
	const at = options.at ?? browser();
	const store = options.store ?? memory();
	const flags = memory();
	const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
		options.answer ? options.answer() : json(200, MEMBER)
	);
	const auth = backendAuth(CONFIG, ORIGIN, fetchFn as typeof fetch, at, store, flags);
	return { auth, at, store, flags, fetchFn };
}

/** A phone already signed in. */
function signedIn() {
	const store = memory();
	store.setItem(
		SESSION,
		JSON.stringify({ token: 'fhs_token-1', account: { id: 'oid-1.tenant-1', username: 'ross@example.com' } })
	);
	return store;
}

describe('the settings', () => {
	it('come from the build, without a trailing slash on the API', () => {
		const config = readConfig({
			VITE_FAMILYHUB_ENTRA_TENANT_ID: 'tenant-1',
			VITE_FAMILYHUB_ENTRA_SUBDOMAIN: 'familyhubtest',
			VITE_FAMILYHUB_APP_CLIENT_ID: 'app-1',
			VITE_FAMILYHUB_API_URL: 'https://api.example/'
		});
		expect(config).toEqual(CONFIG);
	});

	it('are missing if any one is', () => {
		expect(readConfig({ VITE_FAMILYHUB_ENTRA_TENANT_ID: 'tenant-1', VITE_FAMILYHUB_APP_CLIENT_ID: '' })).toBeNull();
		expect(readConfig({})).toBeNull();
	});

	it("count a variable Azure DevOps didn't have as missing", () => {
		expect(
			readConfig({
				VITE_FAMILYHUB_ENTRA_TENANT_ID: 'tenant-1',
				VITE_FAMILYHUB_ENTRA_SUBDOMAIN: 'familyhubtest',
				VITE_FAMILYHUB_APP_CLIENT_ID: '$(FAMILYHUB_APP_CLIENT_ID)',
				VITE_FAMILYHUB_API_URL: 'https://api.example'
			})
		).toBeNull();
	});
});

describe('signing in', () => {
	it('starts with nobody', async () => {
		const { auth } = setUp();

		expect(await auth.start()).toBeNull();
		expect(await auth.token()).toBeNull();
	});

	it("goes to the backend's sign-in, coming back to the app", async () => {
		const { auth, at } = setUp();

		await auth.signIn();

		expect(at.go).toHaveBeenCalledWith('https://api.example/auth/sign-in?return_to=https%3A%2F%2Fapp.example');
	});

	it('swaps the one-time code for a session, and keeps it', async () => {
		const { auth, store, fetchFn } = setUp({ at: browser('/auth/done', '?code=one-time') });

		const account = await auth.start();

		const [url, init] = fetchFn.mock.calls[0]!;
		expect(url).toBe('https://api.example/auth/session');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual({ code: 'one-time' });
		// The same id MSAL gave the account, so a copy from before still counts as theirs.
		expect(account).toEqual({
			id: 'oid-1.tenant-1',
			username: 'ross@example.com',
			name: 'Ross Graham',
			givenName: 'Ross'
		});
		expect(await auth.token()).toBe('fhs_token-1');
		expect(store.stored.has(SESSION)).toBe(true);
	});

	it("takes the code out of the address, so it isn't left in history", async () => {
		const { auth, at } = setUp({ at: browser('/auth/done', '?code=one-time') });

		await auth.start();

		expect(at.replace).toHaveBeenCalledWith('/');
	});

	it('stays signed in when the app is opened again', async () => {
		const { auth, fetchFn } = setUp({ store: signedIn() });

		expect((await auth.start())?.id).toBe('oid-1.tenant-1');
		expect(await auth.token()).toBe('fhs_token-1');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('gives the email of an account that is not the Household’s, with no session', async () => {
		const { auth, store } = setUp({
			at: browser('/auth/done', '?code=one-time'),
			answer: async () => json(200, { kind: 'refused', email: 'stranger@example.com', token: null })
		});

		const failure = await auth.start().catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(NotTheHousehold);
		expect((failure as NotTheHousehold).email).toBe('stranger@example.com');
		expect(store.stored.has(SESSION)).toBe(false);
	});

	it.each([
		['cancelled at the account choice', '?error=access_denied', async () => json(200, MEMBER)],
		['a code that has run out', '?code=old', async () => json(400, { detail: 'run out' })],
		[
			'no signal for the swap',
			'?code=one-time',
			async (): Promise<Response> => {
				throw new TypeError('Failed to fetch');
			}
		]
	])('fails to sign in when it comes back %s', async (_why, search, answer) => {
		const { auth, store } = setUp({ at: browser('/auth/done', search), answer });

		await expect(auth.start()).rejects.toBeInstanceOf(SignInFailed);
		expect(store.stored.has(SESSION)).toBe(false);
	});

	it('ignores a stored session that is broken', async () => {
		const store = memory();
		store.setItem(SESSION, '{not json');
		const { auth } = setUp({ store });

		expect(await auth.start()).toBeNull();
	});
});

describe('signing out', () => {
	it('ends the session on the backend, forgets it, and signs out of the tenant, back to the app', async () => {
		const { auth, at, store, fetchFn } = setUp({ store: signedIn() });
		await auth.start();

		await auth.signOut();

		const [url, init] = fetchFn.mock.calls[0]!;
		expect(url).toBe('https://api.example/sessions/current');
		expect(init?.method).toBe('DELETE');
		expect(init?.headers).toEqual({ Authorization: 'Bearer fhs_token-1' });
		expect(store.stored.has(SESSION)).toBe(false);
		expect(at.go).toHaveBeenCalledWith(
			'https://familyhubtest.ciamlogin.com/tenant-1/oauth2/v2.0/logout?client_id=app-1&post_logout_redirect_uri=https%3A%2F%2Fapp.example%2F'
		);
	});

	it('forgets the session even with no signal to end it', async () => {
		const { auth, at, store } = setUp({
			store: signedIn(),
			answer: async () => {
				throw new TypeError('Failed to fetch');
			}
		});

		await auth.signOut();

		expect(store.stored.has(SESSION)).toBe(false);
		expect(at.go).toHaveBeenCalled();
	});

	it('uses another account by signing out, then once back, going straight on to choosing one', async () => {
		const { auth, at } = setUp({ store: signedIn() });

		await auth.anotherAccount();

		expect(at.go.mock.calls[0]![0]).toContain('/oauth2/v2.0/logout');
		expect(auth.wantsAnotherAccount()).toBe(true);
		// Asked once only.
		expect(auth.wantsAnotherAccount()).toBe(false);
	});
});
