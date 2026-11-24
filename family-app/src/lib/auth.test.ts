import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from '@azure/msal-browser';
import { describe, expect, it, vi } from 'vitest';
import { msalAuth, msalConfig, scopesFor, SignInFailed } from './auth.ts';
import { readConfig, type Config } from './config.ts';

const CONFIG: Config = {
	tenantId: 'tenant-1',
	subdomain: 'familyhubtest',
	appClientId: 'app-1',
	apiClientId: 'api-1',
	apiUrl: 'https://api.example'
};
const ORIGIN = 'https://app.example';

function account(overrides: Partial<AccountInfo> = {}): AccountInfo {
	return {
		homeAccountId: 'home',
		environment: 'familyhubtest.ciamlogin.com',
		tenantId: 'tenant-1',
		username: 'ross@example.com',
		localAccountId: 'oid',
		name: 'Ross Graham',
		...overrides
	} as AccountInfo;
}

function fakeClient(overrides: Record<string, unknown> = {}) {
	return {
		initialize: vi.fn(async () => {}),
		handleRedirectPromise: vi.fn(async () => null),
		getActiveAccount: vi.fn(() => null),
		getAllAccounts: vi.fn(() => []),
		setActiveAccount: vi.fn(),
		acquireTokenSilent: vi.fn(async () => ({ accessToken: 'token-1' })),
		loginRedirect: vi.fn(async () => {}),
		logoutRedirect: vi.fn(async () => {}),
		...overrides
	};
}

function flags() {
	const stored = new Map<string, string>();
	return {
		getItem: (key: string) => stored.get(key) ?? null,
		setItem: (key: string, value: string) => void stored.set(key, value),
		removeItem: (key: string) => void stored.delete(key)
	};
}

const auth = (client: ReturnType<typeof fakeClient>, storage = flags()) =>
	msalAuth(CONFIG, ORIGIN, client as unknown as IPublicClientApplication, storage);

describe('the settings', () => {
	it('come from the build, without a trailing slash on the API', () => {
		const config = readConfig({
			VITE_FAMILYHUB_ENTRA_TENANT_ID: 'tenant-1',
			VITE_FAMILYHUB_ENTRA_SUBDOMAIN: 'familyhubtest',
			VITE_FAMILYHUB_APP_CLIENT_ID: 'app-1',
			VITE_FAMILYHUB_API_CLIENT_ID: 'api-1',
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
				VITE_FAMILYHUB_API_CLIENT_ID: 'api-1',
				VITE_FAMILYHUB_API_URL: 'https://api.example'
			})
		).toBeNull();
	});

	it("point MSAL at the FamilyHub tenant, keep tokens on the phone, and ask for the API's scope", () => {
		const config = msalConfig(CONFIG, ORIGIN);
		expect(config.auth.authority).toBe('https://familyhubtest.ciamlogin.com/tenant-1');
		expect(config.auth.knownAuthorities).toEqual(['familyhubtest.ciamlogin.com']);
		expect(config.auth.redirectUri).toBe('https://app.example/');
		expect(config.cache.cacheLocation).toBe('localStorage');
		expect(scopesFor(CONFIG)).toEqual(['api://api-1/Lists.ReadWrite']);
	});
});

describe('signing in', () => {
	it('starts with nobody', async () => {
		expect(await auth(fakeClient()).start()).toBeNull();
	});

	it('finishes a sign-in that has just come back, and remembers who it was', async () => {
		const signedIn = account({ idTokenClaims: { given_name: 'Ross' } });
		const client = fakeClient({ handleRedirectPromise: vi.fn(async () => ({ account: signedIn })) });

		expect(await auth(client).start()).toEqual({
			id: 'home',
			username: 'ross@example.com',
			name: 'Ross Graham',
			givenName: 'Ross'
		});
		expect(client.initialize).toHaveBeenCalledBefore(client.handleRedirectPromise);
		expect(client.setActiveAccount).toHaveBeenCalledWith(signedIn);
	});

	it('stays signed in when the app is opened again', async () => {
		const client = fakeClient({ getAllAccounts: vi.fn(() => [account()]) });

		expect((await auth(client).start())?.username).toBe('ross@example.com');
	});

	it('asks which Google account, every time', async () => {
		const client = fakeClient();
		await auth(client).signIn();

		expect(client.loginRedirect).toHaveBeenCalledWith({
			scopes: ['api://api-1/Lists.ReadWrite'],
			prompt: 'select_account',
			redirectUri: 'https://app.example/'
		});
	});

	it('renews tokens quietly, through the bridge page', async () => {
		const client = fakeClient({ getActiveAccount: vi.fn(() => account()) });
		const signedIn = auth(client);
		await signedIn.start();

		expect(await signedIn.token()).toBe('token-1');
		expect(client.acquireTokenSilent).toHaveBeenCalledWith(
			expect.objectContaining({ redirectUri: 'https://app.example/auth/bridge' })
		);
	});

	it('says to sign in again when it can only renew by asking', async () => {
		const client = fakeClient({
			getActiveAccount: vi.fn(() => account()),
			acquireTokenSilent: vi.fn(async () => {
				throw new InteractionRequiredAuthError('interaction_required', 'Sign in again');
			})
		});
		const signedIn = auth(client);
		await signedIn.start();

		expect(await signedIn.token()).toBeNull();
	});

	it('passes on other failures, such as no signal', async () => {
		const client = fakeClient({
			getActiveAccount: vi.fn(() => account()),
			acquireTokenSilent: vi.fn(async () => {
				throw new Error('network');
			})
		});
		const signedIn = auth(client);
		await signedIn.start();

		await expect(signedIn.token()).rejects.toThrow('network');
	});

	it('has no token with nobody signed in', async () => {
		const client = fakeClient();
		const nobody = auth(client);
		await nobody.start();

		expect(await nobody.token()).toBeNull();
		expect(client.acquireTokenSilent).not.toHaveBeenCalled();
	});

	it('signs out of the tenant and comes back to the app', async () => {
		const signedIn = account();
		const client = fakeClient({ getActiveAccount: vi.fn(() => signedIn) });
		const session = auth(client);
		await session.start();
		await session.signOut();

		expect(client.logoutRedirect).toHaveBeenCalledWith({
			account: signedIn,
			postLogoutRedirectUri: 'https://app.example/'
		});
	});

	it('fails to sign in, rather than seeming offline, when the sign-in comes back with an error', async () => {
		const client = fakeClient({
			handleRedirectPromise: vi.fn(async () => {
				throw new Error('access_denied: the user cancelled');
			})
		});

		await expect(auth(client).start()).rejects.toBeInstanceOf(SignInFailed);
	});

	it('uses another account by signing out, then once back, going straight on to choosing one', async () => {
		const client = fakeClient();
		const storage = flags();
		await auth(client, storage).anotherAccount();
		expect(client.logoutRedirect).toHaveBeenCalledOnce();

		// The sign-out has come back: a new page, so a new Auth, with the same session storage.
		const back = auth(fakeClient(), storage);
		expect(back.wantsAnotherAccount()).toBe(true);
		expect(back.wantsAnotherAccount()).toBe(false);
		expect(auth(fakeClient()).wantsAnotherAccount()).toBe(false);
	});
});
