import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Problem from './Problem.svelte';
import Refused from './Refused.svelte';
import SignedIn from './SignedIn.svelte';
import SignIn from './SignIn.svelte';

const text = (html: string) =>
	html
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

	it('signed in: the name and the circle, with Sign out once the circle is tapped', () => {
		const closed = render(SignedIn, { props: { firstName: 'Ross', initial: 'R', onsignout: noop } }).body;
		const open = render(SignedIn, { props: { firstName: 'Ross', initial: 'R', onsignout: noop, menuOpen: true } }).body;

		expect(text(closed)).toContain('Signed in as Ross');
		expect(closed).toContain('aria-label="Signed in as Ross"');
		expect(text(closed)).not.toContain('Sign out');
		expect(text(open)).toContain('Sign out');
	});

	it('a problem, with Try again when it can be retried', () => {
		expect(text(render(Problem, { props: { message: 'No signal', onretry: noop } }).body)).toContain('Try again');
		expect(text(render(Problem, { props: { message: 'Not set up' } }).body)).not.toContain('Try again');
	});
});
