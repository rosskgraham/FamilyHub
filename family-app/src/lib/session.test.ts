import { describe, expect, it, vi } from 'vitest';
import type { Account, Auth } from './auth.ts';
import { CANT_REACH, decide, firstName } from './session.ts';

const ROSS: Account = { username: 'ross@example.com', name: 'Ross Graham', givenName: 'Ross' };

function fakeAuth(account: Account | null, token: string | null = 'token-1'): Auth {
	return {
		start: vi.fn(async () => account),
		token: vi.fn(async () => token),
		signIn: vi.fn(async () => {}),
		signOut: vi.fn(async () => {})
	};
}

const answer =
	(status: number, body: unknown = {}) =>
	async () =>
		new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('which screen the app opens on', () => {
	it('is sign in (A) when nobody is signed in', async () => {
		const fetchMe = vi.fn(answer(200));

		expect(await decide(fakeAuth(null), fetchMe)).toEqual({ kind: 'sign-in' });
		expect(fetchMe).not.toHaveBeenCalled();
	});

	it('is the Member, by first name, when the backend knows the account', async () => {
		const fetchMe = vi.fn(answer(200, { kind: 'member', member_id: 'ross' }));

		expect(await decide(fakeAuth(ROSS), fetchMe)).toEqual({ kind: 'member', firstName: 'Ross', initial: 'R' });
		expect(fetchMe).toHaveBeenCalledWith('token-1');
	});

	it("is not this account (B), with its email, when the backend says it isn't the Household's", async () => {
		expect(await decide(fakeAuth(ROSS), answer(403, { detail: 'No' }))).toEqual({
			kind: 'refused',
			email: 'ross@example.com'
		});
	});

	it("is sign in again when the token can't be renewed quietly", async () => {
		const fetchMe = vi.fn(answer(200));

		expect(await decide(fakeAuth(ROSS, null), fetchMe)).toEqual({ kind: 'sign-in' });
		expect(fetchMe).not.toHaveBeenCalled();
	});

	it("is sign in again when the backend doesn't accept the token", async () => {
		expect(await decide(fakeAuth(ROSS), answer(401))).toEqual({ kind: 'sign-in' });
	});

	it("says it can't reach FamilyHub when there's no signal or the backend fails", async () => {
		const offline = async () => {
			throw new TypeError('Failed to fetch');
		};

		expect(await decide(fakeAuth(ROSS), offline)).toEqual({ kind: 'problem', message: CANT_REACH });
		expect(await decide(fakeAuth(ROSS), answer(503))).toEqual({ kind: 'problem', message: CANT_REACH });
		expect(await decide(fakeAuth(ROSS), answer(200, { kind: 'hub' }))).toEqual({
			kind: 'problem',
			message: CANT_REACH
		});
	});
});

describe('a first name', () => {
	it("is the given name, else the first word of the name, else the email's start", () => {
		expect(firstName(ROSS)).toBe('Ross');
		expect(firstName({ username: 'x@example.com', name: '  Sam  Jones ' })).toBe('Sam');
		expect(firstName({ username: 'sam.jones@example.com' })).toBe('sam.jones');
	});
});
