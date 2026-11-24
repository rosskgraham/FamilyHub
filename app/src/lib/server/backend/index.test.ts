import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendSignInRefused, type BackendClient } from './auth.ts';

// Set up for the backend all but its certificate, as the e2e tests are.
vi.mock('$app/env/private', () => ({
	BACKEND_URL: 'https://func-familyhub-test.azurewebsites.net',
	ENTRA_TENANT_ID: 'tenant-1',
	ENTRA_SUBDOMAIN: 'familyhubtest',
	BACKEND_API_CLIENT_ID: 'api-1',
	HUB_CLIENT_ID: 'hub-1',
	HUB_CERTIFICATE: undefined
}));

const { backend, checkBackendSignIn } = await import('./index.ts');

const answering = (answer: () => Promise<unknown>): BackendClient => ({
	request: vi.fn(answer) as BackendClient['request']
});

afterEach(() => vi.restoreAllMocks());

describe('backend', () => {
	it('is null without the backend’s settings, so the Hub runs as it did', () => {
		expect(backend()).toBeNull();
	});
});

describe('checkBackendSignIn', () => {
	it('does nothing without the backend’s settings', async () => {
		const log = vi.spyOn(console, 'log');
		const error = vi.spyOn(console, 'error');
		await checkBackendSignIn(null);
		expect(log).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});

	it('says in the log when the backend takes the Hub for the Hub', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const api = answering(async () => ({ kind: 'hub', member_id: null }));
		await checkBackendSignIn(api);
		expect(api.request).toHaveBeenCalledWith('GET', '/me');
		expect(log).toHaveBeenCalledWith('Signed in to the backend as the Hub');
	});

	it('logs a refusal with its reason, and carries on', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		await checkBackendSignIn(
			answering(() => Promise.reject(new BackendSignInRefused('Backend sign-in refused: 401 invalid_client 700027')))
		);
		expect(error).toHaveBeenCalledWith(
			'Backend sign-in check failed:',
			'Backend sign-in refused: 401 invalid_client 700027'
		);
	});

	it('logs the backend taking the Hub for someone else', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		await checkBackendSignIn(answering(async () => ({ kind: 'member' })));
		expect(error).toHaveBeenCalledWith('Backend sign-in: the backend took the Hub for a member');
	});
});
