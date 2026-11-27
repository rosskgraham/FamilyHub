import { describe, expect, it } from 'vitest';
import { hubAnswers } from './hub-answers.ts';

const answering = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;

describe('hubAnswers', () => {
	it('is true when /api/health answers ok', async () => {
		const asked: string[] = [];
		const fetcher = (async (url: string) => (asked.push(url), new Response('{}'))) as unknown as typeof fetch;
		expect(await hubAnswers(fetcher)).toBe(true);
		expect(asked).toEqual(['/api/health']);
	});

	it('is false when it answers with an error', async () => {
		expect(await hubAnswers(answering(502))).toBe(false);
	});

	it('is false when nothing answers', async () => {
		const refused = (async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		expect(await hubAnswers(refused)).toBe(false);
	});

	it('is false when the answer takes too long', async () => {
		const hangs = ((_url: string, init: RequestInit) =>
			new Promise((_, reject) =>
				init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
			)) as unknown as typeof fetch;
		expect(await hubAnswers(hangs, 10)).toBe(false);
	});
});
