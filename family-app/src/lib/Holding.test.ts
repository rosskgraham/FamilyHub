import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Holding from './Holding.svelte';

describe('the holding page', () => {
	it('shows the logo and the name', () => {
		const { body } = render(Holding);

		expect(body).toContain('src="/logo.svg"');
		expect(body).toMatch(/<h1[^>]*>FamilyHub<\/h1>/);
	});
});
