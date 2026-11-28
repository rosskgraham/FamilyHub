import { dayKey } from '#lib/time.ts';
import { loadMeals } from '#lib/server/meals/index.ts';
import { now } from '#lib/server/now.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ meals: await loadMeals(), today: dayKey(now()) });
