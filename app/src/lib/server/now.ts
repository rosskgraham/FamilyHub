import { HUB_NOW } from '$app/env/private';

/** The current moment, or HUB_NOW when the screenshot tests pin the time. */
export function now(): Date {
	return HUB_NOW ? new Date(HUB_NOW) : new Date();
}
