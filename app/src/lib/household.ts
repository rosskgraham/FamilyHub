// Who an Event belongs to: one Member, or Everyone for the Family calendar.
// This moves into the settings file when Calendars come from Google.
export type OwnerId = 'alex' | 'sam' | 'maya' | 'leo' | 'everyone';

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

export const owners: Record<OwnerId, Owner> = {
	alex: { id: 'alex', name: 'Alex', initial: 'A', bg: '#D6E4FF', fg: '#0F2F78', solid: '#2456C9' },
	sam: { id: 'sam', name: 'Sam', initial: 'S', bg: '#FFDDB8', fg: '#6B2E00', solid: '#B85200' },
	maya: { id: 'maya', name: 'Maya', initial: 'M', bg: '#BDEBDD', fg: '#0A4136', solid: '#0B7A64' },
	leo: { id: 'leo', name: 'Leo', initial: 'L', bg: '#E6D8FA', fg: '#46228A', solid: '#6C3FC4' },
	everyone: { id: 'everyone', name: 'Everyone', initial: 'All', bg: '#E3E6EB', fg: '#1E2530', solid: '#4A5565' }
};
