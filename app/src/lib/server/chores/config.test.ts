import { describe, expect, it } from 'vitest';
import { sampleHousehold } from '#lib/household.ts';
import { parseChores, sampleChores } from './config.ts';

const routine = { id: 'morning', name: 'Morning', from: '06:30' };
const chore = { id: 'bed', name: 'Make your bed', icon: 'bed', stars: 1, routines: ['morning'], who: ['maya'] };
const file = (routines: unknown[], chores: unknown[]) => JSON.stringify({ routines, chores });
const parse = (text: string) => parseChores(text, sampleHousehold);

describe('parseChores', () => {
	it('reads Routines and Chores, trimming names and dropping repeats', () => {
		const config = parse(file([{ ...routine, name: ' Morning ' }], [{ ...chore, who: ['maya', 'maya'], days: ['Mon', 'Wed'] }]));
		expect(config).toEqual({ routines: [routine], chores: [{ ...chore, days: ['Mon', 'Wed'] }] });
	});

	it('finds Members by name or id, whatever the capitals', () => {
		const config = parse(file([routine], [{ ...chore, who: ['Maya', 'LEO', ' sam '] }]));
		expect(config.chores[0]!.who).toEqual(['maya', 'leo', 'sam']);
	});

	it('accepts the sample Chores', () => {
		expect(parse(JSON.stringify(sampleChores))).toEqual(sampleChores);
	});

	it.each([
		['not JSON', '{', 'isn’t valid JSON'.replace('’', "'")],
		['no Routines', file([], [chore]), 'needs a "routines" list'],
		['no Chores', file([routine], []), 'needs a "chores" list'],
		['a Routine with a bad id', file([{ ...routine, id: 'Morning!' }], [chore]), 'Routine 1 in chores.json needs a unique "id"'],
		['a Routine without a proper time', file([{ ...routine, from: '6:30' }], [chore]), 'needs a "from" time'],
		['Routines out of order', file([{ ...routine, from: '18:00' }, { ...routine, id: 'later', from: '06:30' }], [chore]), 'in the order they happen'],
		['two Chores with one id', file([routine], [chore, chore]), 'Chore "bed" in chores.json needs a unique "id"'],
		['an unknown icon', file([routine], [{ ...chore, icon: 'rocket' }]), 'one of teeth, bed, shirt'],
		['too many Stars', file([routine], [{ ...chore, stars: 5 }]), '"stars" from 1 to 3'],
		['an unknown Routine', file([routine], [{ ...chore, routines: ['evening'] }]), 'from morning'],
		['someone not in the Household', file([routine], [{ ...chore, who: ['Maya', 'Bob'] }]), `is for "Bob", who isn't in household.json. Members are Alex, Sam, Maya, Leo.`],
		['Everyone doing a Chore', file([routine], [{ ...chore, who: ['everyone'] }]), 'is for "everyone"'],
		['nobody doing a Chore', file([routine], [{ ...chore, who: [] }]), 'needs "who"'],
		['a day that isn’t a day', file([routine], [{ ...chore, days: ['Wednesday'] }]), 'has "days" that'],
	])('explains %s', (_, text, message) => {
		expect(() => parse(text)).toThrow(
			expect.objectContaining({ body: expect.objectContaining({ message: expect.stringContaining(message) }) })
		);
	});
});
