import { json } from '@sveltejs/kit';
import { readUpdateStatus } from '#lib/server/update.ts';
import type { RequestHandler } from './$types';

// What the Pi's updater last said, which Settings asks for every few seconds while it checks or installs (AB#105).
export const GET: RequestHandler = async () => json({ status: await readUpdateStatus() });
