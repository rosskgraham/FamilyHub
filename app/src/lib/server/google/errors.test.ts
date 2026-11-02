import { describe, expect, it } from 'vitest';
import { GoogleRefused, googleError, SignInNeeded } from './errors.ts';

/** Google's error body, as its older APIs such as Tasks and Calendar send it. */
const legacy = (code: number, reason: string, status = 'PERMISSION_DENIED') => ({
	error: { code, message: reason, errors: [{ reason, domain: 'usageLimits' }], status }
});
/** Google's error body as its newer APIs send it. */
const modern = (code: number, status: string, reason: string) => ({
	error: { code, message: reason, status, details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] }
});

describe('googleError', () => {
	it.each([
		['too many requests', 429, {}],
		['a timeout', 408, {}],
		['a server error', 500, {}],
		['Google being down', 503, 'not JSON'],
		['a rate limit sent as 403', 403, legacy(403, 'rateLimitExceeded')],
		['a per-user rate limit sent as 403', 403, legacy(403, 'userRateLimitExceeded')],
		['a used-up quota sent as 403', 403, legacy(403, 'quotaExceeded')],
		['a used-up quota, newer style', 403, modern(403, 'RESOURCE_EXHAUSTED', 'RATE_LIMIT_EXCEEDED')],
		['a rate limit, newer style', 429, modern(429, 'RESOURCE_EXHAUSTED', 'RATE_LIMIT_EXCEEDED')]
	])('says to try again later after %s, so nothing waiting is dropped', (_, status, body) => {
		const e = googleError(status, body, 'Google API request failed');
		expect(e).not.toBeInstanceOf(GoogleRefused);
		expect(e).not.toBeInstanceOf(SignInNeeded);
		expect(e.message).toBe(`Google API request failed: ${status}`);
	});

	it.each([
		['the sign-in missing a permission', legacy(403, 'insufficientPermissions')],
		[
			'the sign-in missing a permission, newer style',
			modern(403, 'PERMISSION_DENIED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
		]
	])('asks for a fresh sign-in after %s', (_, body) => {
		expect(googleError(403, body, 'Google API request failed')).toBeInstanceOf(SignInNeeded);
	});

	it.each([
		['an item that’s gone', 404, legacy(404, 'notFound', 'NOT_FOUND')],
		['an item deleted for good', 410, {}],
		['a request Google can’t make sense of', 400, legacy(400, 'invalid', 'INVALID_ARGUMENT')],
		['being forbidden, for no reason it gives', 403, legacy(403, 'forbidden')]
	])('says Google turned it down after %s, as trying again won’t help', (_, status, body) => {
		const e = googleError(status, body, 'Google API request failed');
		expect(e).toBeInstanceOf(GoogleRefused);
		expect((e as GoogleRefused).status).toBe(status);
	});
});
