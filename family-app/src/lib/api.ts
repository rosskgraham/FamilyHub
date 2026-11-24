// The backend's Shopping list (backend/README.md, The Shopping list), called with the signed-in Member's token.
import { Rejected, SignedOut, type Changes, type ListApi, type Operation } from './shopping.svelte.ts';

/** An access token for the API, or null when the person must sign in again. */
export type Token = () => Promise<string | null>;

export interface BackendList extends ListApi {
	/** A Web PubSub URL for live updates, from GET /live (AB#59). */
	liveUrl(): Promise<string>;
}

export function backendList(apiUrl: string, token: Token, fetchFn: typeof fetch = fetch): BackendList {
	async function call(path: string, init: RequestInit = {}): Promise<Response> {
		const bearer = await token();
		if (!bearer) throw new SignedOut();
		const response = await fetchFn(`${apiUrl}${path}`, {
			...init,
			headers: { ...init.headers, Authorization: `Bearer ${bearer}` }
		});
		// A 403 means the account's no longer the Household's: signing in again shows screen B.
		if (response.status === 401 || response.status === 403) throw new SignedOut();
		if (response.status === 422) throw new Rejected(await response.text());
		if (!response.ok) throw new Error(`The backend answered ${response.status}`);
		return response;
	}

	return {
		async liveUrl() {
			const { url } = (await (await call('/live')).json()) as { url: string };
			return url;
		},
		async send(operations: Operation[]) {
			await call('/lists/shopping/operations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ operations })
			});
		},
		async changes(after: number): Promise<Changes> {
			return (await call(`/lists/shopping/items?after=${after}`)).json();
		}
	};
}
