// Who an Event belongs to: one Member, or Everyone for the Family calendar.
// The real Household comes from app/household.json; sample data uses a made-up one.
export type OwnerId = string;

export const EVERYONE = 'everyone';

export interface Owner {
	id: OwnerId;
	name: string;
	initial: string;
	/** Event background. */
	bg: string;
	/** Event text on `bg`. */
	fg: string;
	/** The badge behind the initial. */
	solid: string;
}

export type Household = Record<OwnerId, Owner>;

/** The colours a Member can have. Each pair passes WCAG AA. */
export const colours = {
	blue: { bg: '#D6E4FF', fg: '#0F2F78', solid: '#2456C9' },
	orange: { bg: '#FFDDB8', fg: '#6B2E00', solid: '#B85200' },
	green: { bg: '#BDEBDD', fg: '#0A4136', solid: '#0B7A64' },
	purple: { bg: '#E6D8FA', fg: '#46228A', solid: '#6C3FC4' }
};

export type Colour = keyof typeof colours;

const everyone: Owner = { id: EVERYONE, name: 'Everyone', initial: 'All', bg: '#E3E6EB', fg: '#1E2530', solid: '#4A5565' };

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
