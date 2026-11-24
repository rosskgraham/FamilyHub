// Which screen to show when the app opens (design/mockups/family-app): sign in (A), the Household's Member, or an
// account that isn't the Household's (B), decided by the backend's GET /me.
import { SignInFailed, type Account, type Auth } from './auth.ts';

export type Screen =
	| { kind: 'loading' }
	| { kind: 'not-set-up' }
	| { kind: 'sign-in' }
	| { kind: 'sign-in-failed' }
	| { kind: 'member'; firstName: string; initial: string }
	| { kind: 'refused'; email: string }
	| { kind: 'problem'; message: string };

export const CANT_REACH = "Can't reach FamilyHub right now. Check the signal, then try again.";
export const SIGN_IN_FAILED = "Signing in didn't finish.";

export function firstName(account: Account): string {
	return account.givenName ?? account.name?.trim().split(/\s+/)[0] ?? account.username.split('@')[0]!;
}

/** Asks the backend who the token is for. */
export type FetchMe = (token: string) => Promise<Response>;

export async function decide(auth: Auth, fetchMe: FetchMe): Promise<Screen> {
	let account: Account | null;
	try {
		account = await auth.start();
	} catch (error) {
		// Cancelled at the account choice, or refused by the tenant: not a signal problem.
		if (error instanceof SignInFailed) return { kind: 'sign-in-failed' };
		throw error;
	}
	if (!account) {
		// Back from signing out on screen B: straight on to choosing another account.
		if (auth.wantsAnotherAccount()) {
			await auth.signIn();
			return { kind: 'loading' };
		}
		return { kind: 'sign-in' };
	}
	const token = await auth.token();
	if (!token) return { kind: 'sign-in' };

	let response: Response;
	try {
		response = await fetchMe(token);
	} catch {
		return { kind: 'problem', message: CANT_REACH };
	}
	// Signed in, but not with one of the Household's accounts.
	if (response.status === 403) return { kind: 'refused', email: account.username };
	// The backend didn't accept the token, so sign in afresh.
	if (response.status === 401) return { kind: 'sign-in' };
	if (!response.ok) return { kind: 'problem', message: CANT_REACH };

	const me = (await response.json()) as { kind?: string };
	if (me.kind !== 'member') return { kind: 'problem', message: CANT_REACH };
	const name = firstName(account);
	return { kind: 'member', firstName: name, initial: name.charAt(0).toUpperCase() };
}
