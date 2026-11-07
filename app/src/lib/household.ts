// Who an Event belongs to: one Member, or Everyone for the Family calendar.
// The real Household comes from app/household.json; sample data uses a made-up one.
import { memberColours, type MemberColours } from './theme.ts';

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

/** The colours a Member, or Everyone, can have. */
export const colours = Object.fromEntries(memberColours.map((c) => [c, themed(c)])) as Record<
	(typeof memberColours)[number],
	MemberColours
>;

export type Colour = keyof typeof colours;

/** Everyone's colour, unless household.json chooses another. */
export const EVERYONE_COLOUR: Colour = 'slate';

export interface MemberConfig {
	id: string;
	name: string;
	colour: Colour;
	initial?: string;
}

/** The Members, in order, then Everyone. */
export function household(members: MemberConfig[], everyoneColour: Colour = EVERYONE_COLOUR): Household {
	const result: Household = {};
	for (const m of members) {
		result[m.id] = {
			id: m.id,
			name: m.name,
			initial: m.initial ?? m.name.charAt(0).toUpperCase(),
			...colours[m.colour]
		};
	}
	result[EVERYONE] = { id: EVERYONE, name: 'Everyone', initial: 'All', ...colours[everyoneColour] };
	return result;
}

export const sampleHousehold = household([
	{ id: 'alex', name: 'Alex', colour: 'blue' },
	{ id: 'sam', name: 'Sam', colour: 'orange' },
	{ id: 'maya', name: 'Maya', colour: 'green' },
	{ id: 'leo', name: 'Leo', colour: 'purple' }
]);
