import { error } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orElse } from './fallback.ts';

describe('orElse', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('gives what the source loaded', async () => {
		expect(await orElse('Shopping list', async () => ['Milk'], [])).toEqual(['Milk']);
	});

	it('gives the fallback when the source breaks, so the rest of the page still shows', async () => {
		const broken = async (): Promise<string[]> => {
			throw new TypeError('Cannot read properties of undefined');
		};
		expect(await orElse('Shopping list', broken, [])).toEqual([]);
		expect(console.error).toHaveBeenCalledWith(
			'Shopping list couldn’t be loaded, so it shows as unavailable:',
			expect.any(TypeError)
		);
	});

	it('still stops the page for a mistake Alex needs to see, such as in household.json', async () => {
		const misconfigured = async () => error(500, 'household.json isn’t valid JSON.');
		await expect(orElse('Calendar', misconfigured, null)).rejects.toMatchObject({
			status: 500,
			body: { message: 'household.json isn’t valid JSON.' }
		});
	});
});
