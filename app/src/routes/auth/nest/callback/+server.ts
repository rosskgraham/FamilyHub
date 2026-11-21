import { redirect } from '@sveltejs/kit';
import { connectNest } from '#lib/server/nest/index.ts';
import type { RequestHandler } from './$types';

// Google sends the browser back here once the thermostat is chosen and the Household has signed in.
export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('nest_state');
	cookies.delete('nest_state', { path: '/auth/nest' });

	const code = url.searchParams.get('code');
	if (url.searchParams.get('error') || !code) redirect(303, '/settings?problem=nest-cancelled');
	if (!state || url.searchParams.get('state') !== state) redirect(303, '/settings?problem=nest-expired');

	try {
		await connectNest(code, `${url.origin}/auth/nest/callback`);
	} catch (e) {
		// Only the message: the error never holds the code or a token, but keep it that way.
		console.error('Connecting the Nest failed:', e instanceof Error ? e.message : e);
		redirect(303, '/settings?problem=nest-failed');
	}
	redirect(303, '/settings');
};
