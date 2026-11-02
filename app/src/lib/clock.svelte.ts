import { browser } from '$app/env';

// One shared clock for the whole screen, ticking every second in the browser.
let current = $state(new Date());

if (browser) {
	setInterval(() => (current = new Date()), 1000);
}

export const clock = {
	get now(): Date {
		// Replaced every second, never changed, so it doesn't need to be a SvelteDate.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		return browser ? current : new Date();
	}
};
