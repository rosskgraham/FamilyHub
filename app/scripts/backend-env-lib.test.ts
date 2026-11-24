import { describe, expect, it } from 'vitest';
import { withSettings } from './backend-env-lib.ts';
import { parseEnv } from './card-dev-lib.ts';

const PEM = '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n';

describe('withSettings', () => {
	it('adds what isn’t there, and leaves the rest alone', () => {
		expect(withSettings('GOOGLE_CLIENT_ID=abc\n# a note\n', { BACKEND_URL: 'https://api' })).toBe(
			'GOOGLE_CLIENT_ID=abc\n# a note\nBACKEND_URL=https://api\n'
		);
	});

	it('changes what is, where it is', () => {
		expect(withSettings('BACKEND_URL=old\r\nHOME_LATITUDE=51.50', { BACKEND_URL: 'https://new' })).toBe(
			'BACKEND_URL=https://new\nHOME_LATITUDE=51.50\n'
		);
	});

	it('puts the certificate in as base64 on one line, which the Hub and the card dev servers read back', () => {
		const env = withSettings('', { HUB_CERTIFICATE: PEM, HUB_CLIENT_ID: 'hub-1' });
		expect(env.split('\n')).toHaveLength(3);
		expect(Buffer.from(parseEnv(env).HUB_CERTIFICATE!, 'base64').toString()).toBe(PEM);
		expect(parseEnv(env).HUB_CLIENT_ID).toBe('hub-1');
	});
});
