// Who an Event belongs to: one Member, or Everyone for the Family calendar.
// The real Household comes from app/household.json; sample data uses a made-up one.
import type { MemberColours, memberColours } from './theme.ts';

export type OwnerId = string;

export const EVERYONE = 'everyone';

export interface Owner extends MemberColours {
	id: OwnerId;
	name: string;
	initial: string;
}

export type Household = Record<OwnerId, Owner>;

// Each theme draws a colour differently, so a Member's colours point at the theme's CSS variables.
function themed(colour: (typeof memberColours)[number]): MemberColours {
	return {
		bg: `var(--${colour}-bg)`,
		fg: `var(--${colour}-fg)`,
		solid: `var(--${colour}-solid)`,
		on: `var(--${colour}-on)`
	};
}

/** The colours a Member can have. */
export const colours = {
	blue: themed('blue'),
	orange: themed('orange'),
	green: themed('green'),
	purple: themed('purple')
};

export type Colour = keyof typeof colours;

const everyone: Owner = { id: EVERYONE, name: 'Everyone', initial: 'All', ...themed('everyone') };

export interface MemberConfig {
	id: string;
	name: string;
	colour: Colour;
	initial?: string;
}

/** The Members, in order, then Everyone. */
export function household(members: MemberConfig[]): Household {
	const result: Household = {};
	for (const m of members) {
		result[m.id] = { id: m.id, name: m.name, initial: m.initial ?? m.name.charAt(0).toUpperCase(), ...colours[m.colour] };
	}
	result[EVERYONE] = everyone;
	return result;
}

export const sampleHousehold = household([
	{ id: 'alex', name: 'Alex', colour: 'blue' },
	{ id: 'sam', name: 'Sam', colour: 'orange' },
	{ id: 'maya', name: 'Maya', colour: 'green' },
	{ id: 'leo', name: 'Leo', colour: 'purple' }
]);
