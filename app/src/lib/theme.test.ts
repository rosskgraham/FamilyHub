import { describe, expect, it } from 'vitest';
import { sleepPalette } from './sleep.ts';
import { memberColours, palettes, themeAt, themes, type Palette } from './theme.ts';

describe('themeAt', () => {
	const sun = { sunrise: '07:05', sunset: '16:40' };

	it.each([
		['2026-10-28T07:04:59Z', 'evening'],
		['2026-10-28T07:05:00Z', 'day'],
		['2026-10-28T16:39:59Z', 'day'],
		['2026-10-28T16:40:00Z', 'evening'],
		['2026-10-28T23:30:00Z', 'evening']
	])('at %s is %s', (at, theme) => {
		expect(themeAt(new Date(at), sun)).toBe(theme);
	});

	it('reads sunrise and sunset as UK times, in summer time too', () => {
		// 20:30 BST is 19:30 UTC.
		expect(themeAt(new Date('2026-06-21T19:30:00Z'), { sunrise: '04:43', sunset: '21:21' })).toBe('day');
		expect(themeAt(new Date('2026-06-21T20:30:00Z'), { sunrise: '04:43', sunset: '21:21' })).toBe('evening');
	});
});

// WCAG 2.1 contrast, from https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

// Text, then what it sits on.
const text = (p: Palette): [string, string, string][] => [
	['ink on bg', p.ink, p.bg],
	['ink on card', p.ink, p.card],
	['ink on soft', p.ink, p.soft],
	['ink on segment', p.ink, p.segment],
	['ink on selected', p.ink, p.selected],
	['ink on past', p.ink, p.past],
	['ink on past head', p.ink, p.pastHead],
	['dim on bg', p.dim, p.bg],
	['dim on card', p.dim, p.card],
	['dim on past', p.dim, p.past],
	['on ink', p.onInk, p.ink],
	['on hero', p.onHero, p.hero],
	['hero dim', p.heroDim, p.hero],
	['Stars count', p.starFg, p.starBg],
	['Stars earned', p.starFg, p.bg],
	['warning', p.warnFg, p.warnBg],
	['problem', p.problem, p.card],
	['danger', p.onDanger, p.danger],
	['Cheap window', p.windowFg, p.windowBg],
	...memberColours.flatMap((m): [string, string, string][] => [
		[`${m} Event`, p.members[m].fg, p.members[m].bg],
		[`${m} all-day Event`, p.members[m].fg, p.card],
		[`${m} initial`, p.members[m].on, p.members[m].solid]
	])
];

// Shapes that have to be seen, but aren't text: 3:1.
const shapes = (p: Palette): [string, string, string][] => [
	['empty tick box', p.box, p.card],
	['star outline', p.starLine, p.card],
	...(['cheap', 'normal', 'peak'] as const).flatMap((band): [string, string, string][] => [
		[`${band} bar`, p[band], p.card],
		[`${band} bar in the Cheap window`, p[band], p.windowBg]
	]),
	...memberColours.map((m): [string, string, string] => [`${m} badge`, p.members[m].solid, p.card])
];

describe.each(themes)('the %s theme', (theme) => {
	const palette = palettes[theme];

	it.each(text(palette))('has readable text: %s', (_, fg, bg) => {
		expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
	});

	it.each(shapes(palette))('has visible shapes: %s', (_, fg, bg) => {
		expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
	});
});

describe('Sleep', () => {
	const p = sleepPalette;

	it.each([
		['clock', p.clock],
		['date', p.text],
		['next Event', p.event],
		['hint', p.hint]
	])('has readable text: %s', (_, fg) => {
		expect(contrast(fg, p.bg)).toBeGreaterThanOrEqual(4.5);
	});

	// Sleep draws Members in their Evening colours.
	it.each(memberColours)('has a visible %s badge', (m) => {
		expect(contrast(palettes.evening.members[m].solid, p.bg)).toBeGreaterThanOrEqual(3);
	});
});
