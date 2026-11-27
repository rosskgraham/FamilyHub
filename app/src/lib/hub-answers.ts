// Whether the Hub's own server answers, asked before the screen loads anything from it (AB#41). While a release
// restarts the Hub, nothing answers for a moment. A data load that fails then makes SvelteKit fall back to loading the
// whole page, and the browser shows its "page not reachable" page instead of the Hub. So the screen keeps what it shows
// and tries again later.

/** How long to wait for an answer. The server is on the same Pi, so a healthy one answers in milliseconds. */
export const ANSWER_MS = 3_000;

export async function hubAnswers(fetcher: typeof fetch = fetch, timeoutMs = ANSWER_MS): Promise<boolean> {
	try {
		const response = await fetcher('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
		return response.ok;
	} catch {
		return false;
	}
}
