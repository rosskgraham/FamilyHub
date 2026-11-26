// Signing in through the backend, which holds the sign-in as a confidential client (ADR 0016, AB#93), against the
// FamilyHub tenant in Entra External ID, where Google is the way in (ADR 0010). Sign in is a full-page trip to the
// backend's /auth/sign-in, which comes back to /auth/done with a one-time code, swapped here for a session token.
// The token is kept in local storage and sent on every call. The backend refreshes the Member's sign-in from Entra
// itself, so the app stays signed in for as long as the phone's used, up to 90 days unused.
import type { Config } from './config.ts';

/** Who's signed in, as far as the app shows it. */
export interface Account {
	/** The id the phone's copy of the list belongs to. */
	id: string;
	/** Their email address. */
	username: string;
	name?: string;
	givenName?: string;
}

export interface Auth {
	/**
	 * Finishes a sign-in that's just come back, and says who's signed in, if anyone. Throws SignInFailed if the
	 * sign-in came back with an error, as when it's cancelled, and NotTheHousehold for an account that isn't one of
	 * the Household's.
	 */
	start(): Promise<Account | null>;
	/** The session token for the API, or null when the person must sign in again. */
	token(): Promise<string | null>;
	signIn(): Promise<void>;
	signOut(): Promise<void>;
	/** Signs out, then goes straight on to choosing an account when the app comes back (screen B). */
	anotherAccount(): Promise<void>;
	/** Whether anotherAccount has just signed out, and the app should go on to choosing an account. Asks once. */
	wantsAnotherAccount(): boolean;
}

/** A sign-in that came back with an error: cancelled at the account choice, refused by the tenant, or run out. */
export class SignInFailed extends Error {}

/** Signed in with an account that isn't one of the Household's (screen B). */
export class NotTheHousehold extends Error {
	constructor(readonly email: string) {
		super(`${email} isn't one of the Household's accounts`);
	}
}

/** Where the backend sends the browser back to after signing in. */
export const DONE_PATH = '/auth/done';

/** Where the session is kept on the phone. */
const SESSION = 'familyhub.session';
/** Set while signing out to use another account, for the app to find when the sign-out comes back. */
const ANOTHER_ACCOUNT = 'familyhub.another-account';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Session {
	token: string;
	account: Account;
}

/** What POST /auth/session answers (backend/README.md, Sessions). */
interface SessionAnswer {
	kind: 'member' | 'refused';
	token?: string | null;
	email?: string | null;
	object_id?: string | null;
	name?: string | null;
	given_name?: string | null;
}

/** The parts of the browser the app's sign-in uses, so tests can stand in for them. */
export interface Browser {
	/** Where the app is now: its path and query. */
	location: Pick<Location, 'pathname' | 'search'>;
	/** Goes to another address, leaving the app. */
	go(url: string): void;
	/** Changes the address shown, without going anywhere, so a used code doesn't stay in history. */
	replace(path: string): void;
}

const realBrowser = (): Browser => ({
	location,
	go: (url) => location.assign(url),
	replace: (path) => history.replaceState(history.state, '', path)
});

export function backendAuth(
	config: Config,
	origin: string,
	fetchFn: typeof fetch = (...args) => fetch(...args),
	browser: Browser = realBrowser(),
	// Local storage keeps the session between openings.
	store: Store = localStorage,
	// Session storage lasts through the trip to the tenant and back, in the same tab, and no longer.
	flags: Store = sessionStorage
): Auth {
	function saved(): Session | null {
		try {
			const session = JSON.parse(store.getItem(SESSION) ?? 'null') as Session | null;
			return session?.token && session.account?.id ? session : null;
		} catch {
			return null;
		}
	}

	async function finish(params: URLSearchParams): Promise<Account> {
		const code = params.get('code');
		if (!code) throw new SignInFailed(params.get('error') ?? 'no code');
		let response: Response;
		try {
			response = await fetchFn(`${config.apiUrl}/auth/session`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
		} catch (error) {
			// The code lasts 2 minutes, so trying again later won't help: sign in afresh.
			throw new SignInFailed(String(error), { cause: error });
		}
		if (!response.ok) throw new SignInFailed(`The backend answered ${response.status}`);
		const answer = (await response.json()) as SessionAnswer;
		if (answer.kind === 'refused') throw new NotTheHousehold(answer.email ?? '');
		if (!answer.token || !answer.object_id) throw new SignInFailed('No session in the answer');
		const account: Account = {
			// The same id MSAL gave the account (AB#56), so a copy kept on the phone before AB#94 is still theirs.
			id: `${answer.object_id}.${config.tenantId}`,
			username: answer.email ?? '',
			name: answer.name || undefined,
			givenName: answer.given_name || undefined
		};
		store.setItem(SESSION, JSON.stringify({ token: answer.token, account } satisfies Session));
		return account;
	}

	async function signOut() {
		const session = saved();
		store.removeItem(SESSION);
		if (session) {
			// Ends it on the backend too. With no signal it can't, and the backend lets it run out instead.
			await fetchFn(`${config.apiUrl}/sessions/current`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${session.token}` }
			}).catch(() => {});
		}
		// Signs out of the tenant as well, so the next sign-in can choose another account.
		const query = new URLSearchParams({ client_id: config.appClientId, post_logout_redirect_uri: `${origin}/` });
		browser.go(`https://${config.subdomain}.ciamlogin.com/${config.tenantId}/oauth2/v2.0/logout?${query}`);
	}

	return {
		async start() {
			if (browser.location.pathname === DONE_PATH) {
				const params = new URLSearchParams(browser.location.search);
				browser.replace('/');
				return finish(params);
			}
			return saved()?.account ?? null;
		},
		async token() {
			return saved()?.token ?? null;
		},
		async signIn() {
			browser.go(`${config.apiUrl}/auth/sign-in?${new URLSearchParams({ return_to: origin })}`);
		},
		signOut,
		async anotherAccount() {
			flags.setItem(ANOTHER_ACCOUNT, '1');
			await signOut();
		},
		wantsAnotherAccount() {
			const wanted = flags.getItem(ANOTHER_ACCOUNT) !== null;
			flags.removeItem(ANOTHER_ACCOUNT);
			return wanted;
		}
	};
}
