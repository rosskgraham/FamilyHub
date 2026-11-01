import { isHttpError } from '@sveltejs/kit';

/**
 * What `load` gives, or `fallback` if it breaks, so one source going wrong leaves the rest of the page working.
 * An `error()` it throws on purpose, such as for a mistake in household.json, still stops the page, to say what's wrong.
 */
export async function orElse<T>(name: string, load: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await load();
	} catch (e) {
		if (isHttpError(e)) throw e;
		console.error(`${name} couldn’t be loaded, so it shows as unavailable:`, e);
		return fallback;
	}
}
