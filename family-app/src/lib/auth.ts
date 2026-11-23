// Signing in with MSAL against the FamilyHub tenant in Entra External ID, where Google is the way in (ADR 0010).
// Sign-in is a full-page redirect, which an installed app handles better than a popup. Tokens are kept in local
// storage, so the app stays signed in between openings. A single-page app's refresh token lasts 24 hours; after
// that MSAL renews through the tenant's session in a hidden frame that lands on /auth/bridge, or the app asks to
// sign in again (AB#56 measures how often).
import {
	InteractionRequiredAuthError,
	PublicClientApplication,
	type AccountInfo,
	type IPublicClientApplication
} from '@azure/msal-browser';
import type { Config } from './config.ts';

/** Who's signed in, as far as the app shows it. */
export interface Account {
	/** Their email address. */
	username: string;
	name?: string;
	givenName?: string;
}

export interface Auth {
	/** Finishes a sign-in that's just come back, and says who's signed in, if anyone. */
	start(): Promise<Account | null>;
	/** An access token for the API, renewed quietly, or null when the person must sign in again. */
	token(): Promise<string | null>;
	signIn(): Promise<void>;
	signOut(): Promise<void>;
}

/** The page the hidden renewal frame lands on, which passes the answer back to the app. */
export const BRIDGE_PATH = '/auth/bridge';

export function scopesFor(config: Config): string[] {
	return [`api://${config.apiClientId}/Lists.ReadWrite`];
}

export function msalConfig(config: Config, origin: string) {
	return {
		auth: {
			clientId: config.appClientId,
			authority: `https://${config.subdomain}.ciamlogin.com/${config.tenantId}`,
			knownAuthorities: [`${config.subdomain}.ciamlogin.com`],
			redirectUri: `${origin}/`,
			postLogoutRedirectUri: `${origin}/`
		},
		cache: { cacheLocation: 'localStorage' }
	};
}

function toAccount(account: AccountInfo): Account {
	const givenName = account.idTokenClaims?.given_name;
	return {
		username: account.username,
		name: account.name || undefined,
		givenName: typeof givenName === 'string' && givenName ? givenName : undefined
	};
}

export function msalAuth(
	config: Config,
	origin: string,
	client: IPublicClientApplication = new PublicClientApplication(msalConfig(config, origin))
): Auth {
	const scopes = scopesFor(config);
	let account: AccountInfo | null = null;

	return {
		async start() {
			await client.initialize();
			const result = await client.handleRedirectPromise();
			account = result?.account ?? client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
			if (account) client.setActiveAccount(account);
			return account ? toAccount(account) : null;
		},
		async token() {
			if (!account) return null;
			try {
				const result = await client.acquireTokenSilent({ scopes, account, redirectUri: `${origin}${BRIDGE_PATH}` });
				return result.accessToken;
			} catch (error) {
				if (error instanceof InteractionRequiredAuthError) return null;
				throw error;
			}
		},
		async signIn() {
			// Asks which Google account every time, so someone signed in with the wrong one can pick another.
			await client.loginRedirect({ scopes, prompt: 'select_account', redirectUri: `${origin}/` });
		},
		async signOut() {
			await client.logoutRedirect({ account: account ?? undefined, postLogoutRedirectUri: `${origin}/` });
		}
	};
}
