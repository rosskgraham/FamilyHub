// Which screen to show when the app opens (design/mockups/family-app): sign in (A), the Household's Member, or an
// account that isn't the Household's (B), decided by the backend's GET /me.
import type { Account, Auth } from './auth.ts';

export type Screen =
	| { kind: 'loading' }
	| { kind: 'not-set-up' }
	| { kind: 'sign-in' }
	| { kind: 'member'; firstName: string; initial: string }
	| { kind: 'refused'; email: string }
	| { kind: 'problem'; message: string };

export const CANT_REACH = "Can't reach FamilyHub right now. Check the signal, then try again.";

export function firstName(account: Account): string {
	return account.givenName ?? account.name?.trim().split(/\s+/)[0] ?? account.username.split('@')[0]!;
}

/** Asks the backend who the token is for. */
export type FetchMe = (token: string) => Promise<Response>;

export async function decide(auth: Auth, fetchMe: FetchMe): Promise<Screen> {
	const account = await auth.start();
	if (!account) return { kind: 'sign-in' };
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
