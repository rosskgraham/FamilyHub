import { loadShopping } from '#lib/server/shopping/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ shopping: await loadShopping() });
