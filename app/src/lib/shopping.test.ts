import { describe, expect, it } from 'vitest';
import { matchName } from './shopping.ts';

describe('matchName', () => {
	it('matches names as the backend does: lowercase, trimmed, runs of spaces collapsed, trailing punctuation off', () => {
		expect(['Milk', ' milk ', 'Milk.', 'MILK!!', 'milk\t'].map(matchName)).toEqual(Array(5).fill('milk'));
		expect(matchName('Washing   up  liquid')).toBe('washing up liquid');
		expect(matchName('Cheese & onion crisps')).toBe('cheese & onion crisps');
	});

	it('keeps plurals apart, and a name that’s all punctuation matches nothing', () => {
		expect(matchName('apple')).not.toBe(matchName('apples'));
		expect(matchName('...')).toBe('');
	});
});
