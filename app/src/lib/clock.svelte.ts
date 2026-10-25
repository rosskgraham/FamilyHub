import { browser } from '$app/env';

// One shared clock for the whole screen, ticking every second in the browser.
let current = $state(new Date());

if (browser) {
	setInterval(() => (current = new Date()), 1000);
}

export const clock = {
	get now(): Date {
		return browser ? current : new Date();
	}
};
