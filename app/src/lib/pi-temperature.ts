// What a Pi 5 temperature means for whether it needs a fan. Its firmware slows the CPU down from 85 °C.

export const THROTTLE_C = 85;

export type Warmth = 'fine' | 'warm' | 'hot';

/** Under 70 °C is fine without a fan; from 80 °C it's close to slowing down. */
export function warmth(celsius: number): Warmth {
	if (celsius >= 80) return 'hot';
	if (celsius >= 70) return 'warm';
	return 'fine';
}

export const warmthNote: Record<Warmth, string> = {
	fine: 'Fine without a fan.',
	warm: 'Warm. Worth keeping an eye on.',
	hot: `Close to ${THROTTLE_C} °C, where the Pi slows itself down. Add a fan.`
};
