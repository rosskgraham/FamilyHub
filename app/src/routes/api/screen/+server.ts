import { json } from '@sveltejs/kit';
import { now } from '#lib/server/now.ts';
import { screenTouched, screenTouches } from '#lib/server/screen.ts';
import { readSleepHours } from '#lib/server/settings.ts';
import { inLightsOut } from '#lib/sleep.ts';
import type { RequestHandler } from './$types';

// The Pi's screen service asks this every half a minute, and darkens the screen in Lights out hours once it's been
// left alone for two minutes. The touches are the service's to count, as it sees them while the screen is dark, and the
// page asks for them while it's asleep.
export const GET: RequestHandler = async () =>
	json({ lightsOut: inLightsOut(now(), await readSleepHours()), touches: screenTouches() });

// The screen service lit the screen for a touch, so the Hub should wake as if Chromium had seen it.
export const POST: RequestHandler = () => {
	screenTouched();
	return new Response(null, { status: 204 });
};
