import { redirect } from '@sveltejs/kit';
import { NEST_SIGN_IN_ORIGIN, nestConfigured, nestSignInUrl } from '#lib/server/nest/index.ts';
import type { RequestHandler } from './$types';

// Starts connecting the Nest: Nest's Partner Connections page, where the thermostat is chosen, then Google's sign-in.
export const GET: RequestHandler = ({ url, cookies }) => {
	if (!nestConfigured()) redirect(303, '/settings');
	const state = crypto.randomUUID();
	cookies.set('nest_state', state, { path: '/auth/nest', httpOnly: true, sameSite: 'lax', maxAge: 600 });
	redirect(303, nestSignInUrl(`${url.origin}/auth/nest/callback`, state), { external: [NEST_SIGN_IN_ORIGIN] });
};
