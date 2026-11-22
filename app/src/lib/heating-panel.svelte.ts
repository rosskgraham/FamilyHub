import { invalidateAll } from '$app/navigation';
import type { TargetChange } from './heating.ts';
import { createDial } from './heating-dial.ts';

// Whether the Heating panel is open, and its dial. One for the whole screen: the layout draws it over any view, as it
// does an Event's detail. The dial lives here, not in the panel, so a target tapped just before it closes still goes.

let open = $state(false);
// Bumped when the dial changes, so what reads it shows the change.
let version = $state(0);

async function send(target: number): Promise<TargetChange | null> {
	const response = await fetch('/api/heating', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ target })
	});
	const change = response.ok || response.status === 409 ? ((await response.json()) as TargetChange) : null;
	// The header and the panel show the heating as the Nest now reports it.
	await invalidateAll();
	return change;
}

const dial = createDial({ send, onchange: () => version++ });

export const heatingPanel = {
	get open(): boolean {
		return open;
	},
	get target(): number | null {
		void version;
		return dial.target;
	},
	get failed(): boolean {
		void version;
		return dial.failed;
	},
	tap(direction: 1 | -1, nest: number) {
		dial.tap(direction, nest);
	},
	show() {
		dial.reset();
		open = true;
	},
	close() {
		dial.flush();
		open = false;
	}
};
