import { redirect } from '@sveltejs/kit';
import { isConfigured, signInUrl } from '#lib/server/google/auth.ts';
import type { RequestHandler } from './$types';

// Starts signing the Hub in to the Household's Google account.
export const GET: RequestHandler = ({ url, cookies }) => {
	if (!isConfigured()) redirect(303, '/setup');
	const state = crypto.randomUUID();
	cookies.set('google_state', state, { path: '/auth/google', httpOnly: true, sameSite: 'lax', maxAge: 600 });
	redirect(303, signInUrl(`${url.origin}/auth/google/callback`, state));
};
