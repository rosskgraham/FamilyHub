import { describe, expect, it } from 'vitest';
import { announceListChanged } from '#lib/server/changes.ts';
import { GET } from './+server.ts';

describe('GET /api/changes', () => {
	it('sends a message each time a list changes, until the screen goes', async () => {
		const response = (await GET({} as Parameters<typeof GET>[0])) as Response;
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		const reader = response.body!.getReader();

		announceListChanged('shopping');
		const { value } = await reader.read();
		expect(new TextDecoder().decode(value)).toBe('data: {"list":"shopping"}\n\n');

		await reader.cancel();
		expect(() => announceListChanged('shopping')).not.toThrow();
	});
});
