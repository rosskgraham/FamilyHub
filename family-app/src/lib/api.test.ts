import { describe, expect, it, vi } from 'vitest';
import { backendList } from './api.ts';
import { Rejected, SignedOut } from './shopping.svelte.ts';

const API = 'https://api.example';
const answer = (status: number, body: unknown = {}) =>
	vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

describe("the backend's Shopping list", () => {
	it('sends operations with the token, as JSON', async () => {
		const fetchFn = answer(200, { results: [] });
		const operations = [{ id: 'op-1', type: 'tick' as const, item_id: 'item-1' }];

		await backendList(API, async () => 'token-1', fetchFn).send(operations);

		const [url, init] = fetchFn.mock.calls[0]!;
		expect(url).toBe('https://api.example/lists/shopping/operations');
		expect(init?.method).toBe('POST');
		expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer token-1' });
		expect(JSON.parse(init?.body as string)).toEqual({ operations });
	});

	it('asks GET /live for a live updates URL', async () => {
		const fetchFn = answer(200, { url: 'wss://live.example/client?access_token=t' });

		expect(await backendList(API, async () => 'token-1', fetchFn).liveUrl()).toBe(
			'wss://live.example/client?access_token=t'
		);
		expect(fetchFn.mock.calls[0]![0]).toBe('https://api.example/live');
		await expect(backendList(API, async () => 't', answer(401)).liveUrl()).rejects.toBeInstanceOf(SignedOut);
	});

	it('asks for the changes after a number', async () => {
		const fetchFn = answer(200, { items: [], seq: 7 });

		expect(await backendList(API, async () => 'token-1', fetchFn).changes(5)).toEqual({ items: [], seq: 7 });
		expect(fetchFn.mock.calls[0]![0]).toBe('https://api.example/lists/shopping/items?after=5');
	});

	it("is signed out when there's no token, or the backend says 401 or 403", async () => {
		await expect(backendList(API, async () => null, answer(200)).changes(0)).rejects.toBeInstanceOf(SignedOut);
		await expect(backendList(API, async () => 't', answer(401)).changes(0)).rejects.toBeInstanceOf(SignedOut);
		await expect(backendList(API, async () => 't', answer(403)).changes(0)).rejects.toBeInstanceOf(SignedOut);
	});

	it('is rejected on a 422, and a plain failure otherwise, to be tried again', async () => {
		await expect(backendList(API, async () => 't', answer(422)).send([])).rejects.toBeInstanceOf(Rejected);
		const failed = backendList(API, async () => 't', answer(503)).send([]);
		await expect(failed).rejects.toThrow('503');
		await expect(failed).rejects.not.toBeInstanceOf(SignedOut);
	});
});
