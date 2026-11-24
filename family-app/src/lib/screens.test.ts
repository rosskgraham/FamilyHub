import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Problem from './Problem.svelte';
import Refused from './Refused.svelte';
import Shopping from './Shopping.svelte';
import { ShoppingList, SignedOut, type ServerItem } from './shopping.svelte.ts';
import SignIn from './SignIn.svelte';

// The text as read out: what's hidden from screen readers, such as the band behind a swipe, is left out.
const text = (html: string) =>
	html
		.replace(/<span[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
const noop = () => {};

describe('the screens', () => {
	it('A: sign in, with the logo', () => {
		const { body } = render(SignIn, { props: { onsignin: noop } });

		expect(body).toContain('<svg');
		expect(text(body)).toContain('FamilyHub');
		expect(text(body)).toContain('Sign in with Google');
		expect(text(body)).toContain('Use your own Google account.');
	});

	it('B: not this account, saying which, and nothing about the Household', () => {
		const { body } = render(Refused, { props: { email: 'someone@gmail.com', onanother: noop } });

		expect(text(body)).toContain("someone@gmail.com isn't one of the Household's accounts.");
		expect(text(body)).toContain('Use another account');
		expect(text(body)).not.toContain('Shopping');
	});

	it('a problem, with Try again when it can be retried', () => {
		expect(text(render(Problem, { props: { message: 'No signal', onretry: noop } }).body)).toContain('Try again');
		expect(text(render(Problem, { props: { message: 'Not set up' } }).body)).not.toContain('Try again');
	});

	it('signing in did not finish, with Sign in again', () => {
		const body = render(Problem, {
			props: { message: "Signing in didn't finish.", retry: 'Sign in again', onretry: noop }
		}).body;

		expect(text(body)).toContain("Signing in didn't finish.");
		expect(text(body)).toContain('Sign in again');
	});
});

function item(id: string, text: string, addedSeq: number, tickedOff = false): ServerItem {
	return {
		id,
		text,
		ticked_off: tickedOff,
		ticked_off_at: tickedOff ? new Date().toISOString() : null,
		removed: false,
		seq: addedSeq,
		added_seq: addedSeq
	};
}

async function shopping(...items: ServerItem[]) {
	const list = new ShoppingList({ send: async () => {}, changes: async () => ({ items, seq: items.length }) }, {});
	await list.load();
	list.stop();
	return list;
}

const signedIn = { firstName: 'Ross', initial: 'R', onsignout: noop, onsignin: noop };

/** A list whose sends fail as given, with one change made and waiting. */
async function waiting(error: Error) {
	const list = new ShoppingList(
		{
			send: async () => {
				throw error;
			},
			changes: async () => ({ items: [item('1', 'Milk', 1), item('2', 'Eggs', 2)], seq: 2 })
		},
		{}
	);
	await list.load();
	list.toggle('1');
	await new Promise((resolve) => setTimeout(resolve, 0));
	list.stop();
	return list;
}

describe('the Shopping list screens', () => {
	it('C: items to get newest first, then those ticked off, struck through, and how many to get', async () => {
		const list = await shopping(item('1', 'Milk', 1), item('2', 'Wholemeal bread', 2, true), item('3', 'Eggs', 3));
		const body = render(Shopping, { props: { list, ...signedIn } }).body;

		expect(text(body)).toMatch(/Shopping 2 to get R Eggs Milk ✓ Wholemeal bread Add/);
		expect(body).toMatch(/<li class="[^"]*done[^"]*">.*Wholemeal bread/s);
		expect(body).toContain('aria-checked="true"');
		expect(body).toContain('placeholder="Add an item"');
	});

	it('H: nothing to get', async () => {
		const body = render(Shopping, { props: { list: await shopping(), ...signedIn } }).body;

		expect(text(body)).toContain('Nothing to get');
		expect(text(body)).toContain('All done Add something with the box below.');
	});

	it('E: an item being changed is a text field in its row, with no sheet', async () => {
		const list = await shopping(item('1', 'Washing-up liquid', 1), item('2', 'Milk', 2));
		const body = render(Shopping, { props: { list, ...signedIn, editing: '1' } }).body;

		expect(body).toMatch(/<input[^>]*aria-label="Change Washing-up liquid"[^>]*value="Washing-up liquid"/);
		expect(body).toMatch(/<input[^>]*enterkeyhint="done"/);
		expect(text(body)).not.toContain('Change item');
		expect(text(body)).not.toContain('Save');
		expect(body).toMatch(/<button class="text[^"]*">Milk<\/button>/);
	});

	it('J: each item has a Remove band behind it, for swiping, and no remove button', async () => {
		const list = await shopping(item('1', 'Milk', 1), item('2', 'Eggs', 2));
		const body = render(Shopping, { props: { list, ...signedIn } }).body;

		expect(body.match(/class="band[^"]*" aria-hidden="true">Remove</g)).toHaveLength(2);
		expect(body.match(/data-slide/g)).toHaveLength(2);
	});

	it('Undo after removing an item', async () => {
		const list = await shopping(item('1', 'Lunchbox snacks', 1), item('2', 'Milk', 2));
		list.remove('1');
		const body = render(Shopping, { props: { list, ...signedIn } }).body;
		list.undo();

		expect(text(body)).toContain('Lunchbox snacks removed Undo');
		expect(text(body)).not.toMatch(/Milk.*Lunchbox snacks removed.*Lunchbox snacks/);
	});

	it('I: the circle, with Sign out once it is tapped', async () => {
		const list = await shopping();
		const closed = render(Shopping, { props: { list, ...signedIn } }).body;
		const open = render(Shopping, { props: { list, ...signedIn, menuOpen: true } }).body;

		expect(closed).toContain('aria-label="Signed in as Ross"');
		expect(text(closed)).not.toContain('Sign out');
		expect(text(open)).toContain('Signed in as Ross Sign out');
	});
});

describe('with no signal, or sign-in run out (AB#58)', () => {
	it('F: a banner saying no signal and how many changes will send, and each waiting item marked', async () => {
		const list = await waiting(new TypeError('Failed to fetch'));
		const body = render(Shopping, { props: { list, ...signedIn } }).body;

		expect(text(body)).toContain("No signal 1 change will send when you're back online.");
		expect(text(body)).toMatch(/Eggs ✓ Milk ◷ waiting/);
		expect(text(body).match(/waiting/g)).toHaveLength(1);
	});

	it('F with nothing waiting: the list as it was last seen', async () => {
		const list = await shopping(item('1', 'Milk', 1));
		list.reach = 'offline';
		const body = render(Shopping, { props: { list, ...signedIn } }).body;

		expect(text(body)).toContain('No signal This is the list as it was last seen.');
	});

	it('G: a banner asking to sign in again, saying changes are kept', async () => {
		const list = await waiting(new SignedOut());
		const body = render(Shopping, { props: { list, ...signedIn } }).body;

		expect(text(body)).toContain('Sign in again Changes are kept until you do. Sign in');
		expect(text(body)).not.toContain('No signal');
	});

	it('no banner while the backend can be reached', async () => {
		const body = render(Shopping, { props: { list: await shopping(item('1', 'Milk', 1)), ...signedIn } }).body;

		expect(text(body)).not.toContain('No signal');
		expect(text(body)).not.toContain('Sign in again');
	});

	it("I: the circle's menu says how many changes haven't sent, when some haven't", async () => {
		const list = await waiting(new TypeError('Failed to fetch'));
		const body = render(Shopping, { props: { list, ...signedIn, menuOpen: true } }).body;

		expect(text(body)).toContain("Signed in as Ross 1 change hasn't sent yet. Signing out loses it. Sign out");
	});
});
