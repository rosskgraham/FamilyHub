// What the app shows when it opens (design/mockups/family-app): sign in (A), the Household's Member with the
// Shopping list, or an account that isn't the Household's (B), decided by the backend's GET /me. With a copy of the
// list on the phone for the account that's signed in, the list shows from it straight away, before the backend
// has answered, so it opens in a shop with no signal (AB#58); the backend is asked afterwards.
import { SignInFailed, type Account, type Auth } from './auth.ts';
import type { CopyStore } from './copy.ts';
import { ShoppingList, SignedOut, type ListApi } from './shopping.svelte.ts';

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

export interface Opening {
	auth: Auth;
	fetchMe: FetchMe;
	api: ListApi;
	copy: CopyStore;
	/** Shows a screen, with the list when it's the Member's. Called again if the backend changes the answer. */
	show: (screen: Screen, list: ShoppingList | null) => void;
}

/** Opens the app: from the phone's copy if there's one for this account, else from the backend. */
export async function open({ auth, fetchMe, api, copy, show }: Opening): Promise<void> {
	let account: Account | null;
	try {
		account = await auth.start();
	} catch (error) {
		// Cancelled at the account choice, or refused by the tenant: not a signal problem.
		if (error instanceof SignInFailed) return show({ kind: 'sign-in-failed' }, null);
		throw error;
	}
	// A copy that isn't this account's is never shown, and goes.
	const saved = await copy.read().catch(() => null);
	if (saved && saved.account !== account?.id) await copy.clear();

	if (!account) {
		// Back from signing out on screen B: straight on to choosing another account.
		if (auth.wantsAnotherAccount()) {
			show({ kind: 'loading' }, null);
			return auth.signIn();
		}
		return show({ kind: 'sign-in' }, null);
	}

	const signedIn = account;
	const list: ShoppingList = new ShoppingList(api, {
		onchange: () => void keep().catch(() => {})
	});
	let names = { firstName: saved?.firstName ?? '', initial: saved?.initial ?? '' };
	const keep = () => copy.write({ account: signedIn.id, ...names, list: list.snapshot() });

	if (saved && saved.account === account.id) {
		list.restore(saved.list);
		show({ kind: 'member', ...names }, list);
		const checked = await check(auth, account, fetchMe);
		if (checked.kind === 'refused') {
			list.stop();
			await copy.clear();
			return show(checked, null);
		}
		// Sign-in has run out: the list stays usable, keeping changes until it's done (screen G).
		if (checked.kind === 'sign-in') return list.signedOut();
		// A Member, or the backend can't be reached, which refresh finds and keeps trying.
		return list.refresh();
	}

	const checked = await check(auth, account, fetchMe);
	if (checked.kind !== 'member') return show(checked, null);
	try {
		await list.load();
	} catch (error) {
		return show(error instanceof SignedOut ? { kind: 'sign-in' } : { kind: 'problem', message: CANT_REACH }, null);
	}
	names = { firstName: checked.firstName, initial: checked.initial };
	await keep().catch(() => {});
	show(checked, list);
}

/** Asks the backend who's signed in. */
async function check(auth: Auth, account: Account, fetchMe: FetchMe): Promise<Screen> {
	let token: string | null;
	try {
		token = await auth.token();
	} catch {
		// Renewing needs the network, and there's none.
		return { kind: 'problem', message: CANT_REACH };
	}
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
