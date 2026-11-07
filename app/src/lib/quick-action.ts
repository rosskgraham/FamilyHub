import { invalidateAll } from '$app/navigation';

/**
 * Sends a Quick action to the Hub's server, such as ticking off a Shopping item, then reloads what the page shows.
 * Resolves to null if it worked, or to what to tell the Household if it didn't.
 */
export async function sendChange(url: string, change: unknown): Promise<string | null> {
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(change)
		});
		if (!response.ok) {
			return response.status === 401 ? 'Google needs signing in again.' : 'Google didn’t take that change. Try again.';
		}
		await invalidateAll();
		return null;
	} catch {
		return 'Couldn’t reach the Hub. Try again.';
	}
}
