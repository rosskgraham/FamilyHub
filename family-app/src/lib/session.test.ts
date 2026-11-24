import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInFailed, type Account, type Auth } from './auth.ts';
import { memoryCopy, type Copy } from './copy.ts';
import { FakeBackend } from './fakes.ts';
import { CANT_REACH, firstName, open, type FetchMe, type Screen } from './session.ts';
import type { ShoppingList } from './shopping.svelte.ts';

const ROSS: Account = { id: 'ross-home', username: 'ross@example.com', name: 'Ross Graham', givenName: 'Ross' };

function fakeAuth(account: Account | null, token: string | null = 'token-1', anotherAccount = false): Auth {
	return {
		start: vi.fn(async () => account),
		token: vi.fn(async () => token),
		signIn: vi.fn(async () => {}),
		signOut: vi.fn(async () => {}),
		anotherAccount: vi.fn(async () => {}),
		wantsAnotherAccount: vi.fn(() => anotherAccount)
	};
}

const answer =
	(status: number, body: unknown = {}) =>
	async () =>
		new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const member = answer(200, { kind: 'member', member_id: 'ross' });
const offline = async (): Promise<Response> => {
	throw new TypeError('Failed to fetch');
};
const never = () => new Promise<Response>(() => {});

/** Opens the app, keeping every screen it shows. */
async function opening(auth: Auth, fetchMe: FetchMe, options: { copy?: Copy | null; backend?: FakeBackend } = {}) {
	const backend = options.backend ?? new FakeBackend();
	const copy = memoryCopy(options.copy ?? null);
	const shown: { screen: Screen; list: ShoppingList | null }[] = [];
	const done = open({ auth, fetchMe, api: backend, copy, show: (screen, list) => shown.push({ screen, list }) });
	return { backend, copy, shown, done, last: () => shown.at(-1)! };
}

const texts = (list: ShoppingList | null) => list?.items.map((item) => item.text);

/** A copy on the phone, as an earlier opening left it: Milk known, and Pasta added with no signal. */
function savedCopy(account = 'ross-home'): Copy {
	return {
		account,
		firstName: 'Ross',
		initial: 'R',
		list: {
			seq: 1,
			known: { milk: { id: 'milk', text: 'Milk', tickedOff: false, tickedOffAt: null, order: 1, seq: 1 } },
			queue: [{ op: { id: 'op-1', type: 'add', item_id: 'pasta', text: 'Pasta' }, at: Date.now() }],
			gone: []
		}
	};
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('opening the app', () => {
	it('is sign in (A) when nobody is signed in, and drops any copy left on the phone', async () => {
		const { done, last, copy } = await opening(fakeAuth(null), member, { copy: savedCopy() });
		await done;

		expect(last().screen).toEqual({ kind: 'sign-in' });
		expect(copy.saved).toBeNull();
	});

	it("says signing in didn't finish, not that there's no signal, when the sign-in came back with an error", async () => {
		const auth = fakeAuth(null);
		auth.start = vi.fn(async () => {
			throw new SignInFailed('access_denied');
		});
		const { done, last } = await opening(auth, member);
		await done;

		expect(last().screen).toEqual({ kind: 'sign-in-failed' });
	});

	it('goes straight on to choosing an account after Use another account', async () => {
		const auth = fakeAuth(null, null, true);
		const { done, last } = await opening(auth, member);
		await done;

		expect(last().screen).toEqual({ kind: 'loading' });
		expect(auth.signIn).toHaveBeenCalledOnce();
	});

	it('with no copy, loads the list from the backend and saves it on the phone', async () => {
		const backend = new FakeBackend();
		backend.elsewhere('add', 'milk', 'Milk');
		const { done, last, copy } = await opening(fakeAuth(ROSS), member, { backend });
		await done;

		expect(last().screen).toEqual({ kind: 'member', firstName: 'Ross', initial: 'R' });
		expect(texts(last().list)).toEqual(['Milk']);
		expect(copy.saved).toMatchObject({ account: 'ross-home', firstName: 'Ross', initial: 'R', list: { seq: 1 } });
		last().list?.stop();
	});

	it("with no copy and no signal, says it can't reach FamilyHub", async () => {
		const { done, last } = await opening(fakeAuth(ROSS), offline);
		await done;

		expect(last().screen).toEqual({ kind: 'problem', message: CANT_REACH });
	});

	it("is not this account (B), with its email, when the backend says it isn't the Household's", async () => {
		const { done, last } = await opening(fakeAuth(ROSS), answer(403, { detail: 'No' }));
		await done;

		expect(last().screen).toEqual({ kind: 'refused', email: 'ross@example.com' });
	});

	it("is sign in again when the token can't be renewed quietly, or the backend doesn't accept it", async () => {
		const quietly = await opening(fakeAuth(ROSS, null), member);
		await quietly.done;
		const refused = await opening(fakeAuth(ROSS), answer(401));
		await refused.done;

		expect(quietly.last().screen).toEqual({ kind: 'sign-in' });
		expect(refused.last().screen).toEqual({ kind: 'sign-in' });
	});
});

describe('opening from the phone’s copy (AB#58)', () => {
	it('shows the list from the copy straight away, before the backend answers', async () => {
		const { shown } = await opening(fakeAuth(ROSS), never, { copy: savedCopy() });
		await vi.advanceTimersByTimeAsync(0);

		expect(shown).toHaveLength(1);
		expect(shown[0]!.screen).toEqual({ kind: 'member', firstName: 'Ross', initial: 'R' });
		expect(texts(shown[0]!.list)).toEqual(['Pasta', 'Milk']);
		expect(shown[0]!.list?.items.find((item) => item.text === 'Pasta')?.waiting).toBe(true);
		shown[0]!.list?.stop();
	});

	it('then sends what was waiting and catches up', async () => {
		const backend = new FakeBackend();
		backend.elsewhere('add', 'milk', 'Milk');
		backend.elsewhere('add', 'hub-1', 'Plasters');
		const { done, last, copy } = await opening(fakeAuth(ROSS), member, { copy: savedCopy(), backend });
		await done;

		const list = last().list!;
		expect(backend.items.get('pasta')?.text).toBe('Pasta');
		expect(texts(list)).toEqual(['Pasta', 'Plasters', 'Milk']);
		expect(list.waiting).toBe(0);
		expect(copy.saved?.list.queue).toEqual([]);
		list.stop();
	});

	it('stays on the list, marked offline, when there is no signal', async () => {
		const backend = new FakeBackend();
		backend.failing = new TypeError('Failed to fetch');
		backend.failChanges = new TypeError('Failed to fetch');
		const auth = fakeAuth(ROSS);
		auth.token = vi.fn(async () => {
			throw new Error('no_network_connectivity');
		});
		const { done, last } = await opening(auth, offline, { copy: savedCopy(), backend });
		await done;

		expect(last().screen.kind).toBe('member');
		expect(last().list?.reach).toBe('offline');
		expect(last().list?.waiting).toBe(1);
		last().list?.stop();
	});

	it("keeps the list usable, asking to sign in again, when the token can't be renewed (screen G)", async () => {
		const { done, last, copy } = await opening(fakeAuth(ROSS, null), member, { copy: savedCopy() });
		await done;

		const list = last().list!;
		expect(last().screen.kind).toBe('member');
		expect(list.reach).toBe('signed-out');
		list.add('Eggs');
		expect(copy.saved?.list.queue.map((pending) => pending.op.type)).toEqual(['add', 'add']);
		list.stop();
	});

	it("goes to screen B, and drops the copy, when the account's no longer the Household's", async () => {
		const { done, last, copy } = await opening(fakeAuth(ROSS), answer(403), { copy: savedCopy() });
		await done;

		expect(last().screen).toEqual({ kind: 'refused', email: 'ross@example.com' });
		expect(last().list).toBeNull();
		expect(copy.saved).toBeNull();
	});

	it("never shows or sends another account's copy", async () => {
		const backend = new FakeBackend();
		const { done, shown, copy } = await opening(fakeAuth(ROSS), member, { copy: savedCopy('someone-else'), backend });
		await done;

		expect(shown.map(({ list }) => texts(list))).toEqual([[]]);
		expect(backend.sent).toEqual([]);
		expect(copy.saved?.account).toBe('ross-home');
		shown.at(-1)!.list?.stop();
	});
});

describe('a first name', () => {
	it("is the given name, else the first word of the name, else the email's start", () => {
		expect(firstName(ROSS)).toBe('Ross');
		expect(firstName({ id: 'a', username: 'x@example.com', name: '  Sam  Jones ' })).toBe('Sam');
		expect(firstName({ id: 'b', username: 'sam.jones@example.com' })).toBe('sam.jones');
	});
});
