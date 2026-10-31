import { version } from '$app/env';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The Pi checks this after switching to a new release, and switches back if it doesn't answer
// with the version it just installed (ADR 0004).
export const GET: RequestHandler = () => json({ status: 'ok', version });
