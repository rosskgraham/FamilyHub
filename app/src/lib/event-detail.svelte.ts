import type { CalendarEvent } from './calendar.ts';
import type { Owner } from './household.ts';

// The Event whose detail is showing. One at a time, for the whole screen: the layout draws it over any view.

export interface Shown {
	event: CalendarEvent;
	owner: Owner;
}

let shown: Shown | null = $state(null);

export const eventDetail = {
	get shown(): Shown | null {
		return shown;
	},
	open(event: CalendarEvent, owner: Owner) {
		shown = { event, owner };
	},
	close() {
		shown = null;
	}
};

/**
 * Makes an Event on any view open its detail when tapped. Titles are often cut short on the views, and the detail shows
 * it in full, with when it is. An action, so each view keeps its own markup. Null leaves the element as it is.
 */
export function opensEvent(node: HTMLElement, params: Shown | null) {
	let current = params;
	const open = () => current && eventDetail.open(current.event, current.owner);
	const key = (e: KeyboardEvent) => {
		if (!current || (e.key !== 'Enter' && e.key !== ' ')) return;
		e.preventDefault();
		open();
	};
	const apply = () => {
		if (current) {
			node.setAttribute('role', 'button');
			node.setAttribute('tabindex', '0');
			node.setAttribute('aria-haspopup', 'dialog');
			node.setAttribute('aria-label', `${current.event.title}, show details`);
			node.classList.add('opens-event');
		} else {
			for (const name of ['role', 'tabindex', 'aria-haspopup', 'aria-label']) node.removeAttribute(name);
			node.classList.remove('opens-event');
		}
	};
	apply();
	node.addEventListener('click', open);
	node.addEventListener('keydown', key);
	return {
		update(next: Shown | null) {
			current = next;
			apply();
		},
		destroy() {
			node.removeEventListener('click', open);
			node.removeEventListener('keydown', key);
		}
	};
}
