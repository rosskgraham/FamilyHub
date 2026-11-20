import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Setup is part of Settings now (ADR 0012). Old links and bookmarks still arrive, with any sign-in problem.
export const load: PageServerLoad = ({ url }) => {
	redirect(308, `/settings${url.search}`);
};
