import { redirect } from '@sveltejs/kit';
import { completeSignIn } from '#lib/server/google/auth.ts';
import type { RequestHandler } from './$types';

// Google sends the browser back here after the Household signs in.
export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('google_state');
	cookies.delete('google_state', { path: '/auth/google' });

	const code = url.searchParams.get('code');
	if (url.searchParams.get('error') || !code) redirect(303, '/setup?problem=cancelled');
	if (!state || url.searchParams.get('state') !== state) redirect(303, '/setup?problem=expired');

	try {
		await completeSignIn(code, `${url.origin}/auth/google/callback`);
	} catch (e) {
		console.error('Google sign-in failed:', e);
		redirect(303, '/setup?problem=failed');
	}
	redirect(303, '/setup');
};
