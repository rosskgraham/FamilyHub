import { describe, expect, it } from 'vitest';
import { household } from '#lib/household.ts';
import { parseHousehold } from './household.ts';

const file = (members: unknown) => JSON.stringify({ members });

describe('parseHousehold', () => {
	it('reads Members, giving each an id from their name', () => {
		const members = parseHousehold(file([{ name: ' Mary Ann ', colour: 'green', initial: 'MA' }, { name: 'Tom', colour: 'blue' }]));
		expect(members).toEqual([
			{ id: 'mary-ann', name: 'Mary Ann', colour: 'green', initial: 'MA' },
			{ id: 'tom', name: 'Tom', colour: 'blue', initial: undefined }
		]);
	});

	it.each([
		['not JSON', '{', "isn't valid JSON"],
		['no Members', file([]), 'needs a "members" list'],
		['a Member without a name', file([{ colour: 'blue' }]), 'Member 1 in household.json needs a "name"'],
		['an unknown colour', file([{ name: 'Tom', colour: 'teal' }]), 'one of blue, orange, green, purple'],
		['two Members with one name', file([{ name: 'Tom', colour: 'blue' }, { name: 'tom', colour: 'green' }]), 'Member 2'],
		['a Member called Everyone', file([{ name: 'Everyone', colour: 'blue' }]), 'needs a different name']
	])('explains %s', (_, text, message) => {
		expect(() => parseHousehold(text)).toThrow(expect.objectContaining({ body: expect.objectContaining({ message: expect.stringContaining(message) }) }));
	});
});

describe('household', () => {
	it('gives each Member an initial and colours, then adds Everyone', () => {
		const result = household([
			{ id: 'tom', name: 'tom', colour: 'blue' },
			{ id: 'mary-ann', name: 'Mary Ann', colour: 'green', initial: 'MA' }
		]);
		expect(Object.keys(result)).toEqual(['tom', 'mary-ann', 'everyone']);
		expect(result.tom).toMatchObject({ initial: 'T', solid: 'var(--blue-solid)' });
		expect(result['mary-ann']!.initial).toBe('MA');
		expect(result.everyone!.initial).toBe('All');
	});
});
