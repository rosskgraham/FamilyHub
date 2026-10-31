import { loadRates } from '#lib/server/energy/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ energy: await loadRates() });
