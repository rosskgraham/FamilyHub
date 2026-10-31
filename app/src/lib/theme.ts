// The Day theme until sunset and the Evening theme after it, until sunrise.
import { formatTime } from './time.ts';

export type Theme = 'day' | 'evening';

export const themes: Theme[] = ['day', 'evening'];

/** Today's sunrise and sunset at home, as UK wall-clock times (`HH:mm`). */
export interface SunTimes {
	sunrise: string;
	sunset: string;
}

/** For when the Hub has never heard from Open-Meteo, or shows sample data. Late October in the UK. */
export const sampleSun: SunTimes = { sunrise: '07:05', sunset: '16:40' };

export function themeAt(now: Date, sun: SunTimes): Theme {
	const time = formatTime(now);
	return time >= sun.sunrise && time < sun.sunset ? 'day' : 'evening';
}

/** A Member's colours, as one theme draws them. */
export interface MemberColours {
	/** Event background. */
	bg: string;
	/** Event text on `bg`. */
	fg: string;
	/** The badge behind the initial. */
	solid: string;
	/** The initial, or a tick, on `solid`. */
	on: string;
}

export const memberColours = ['blue', 'orange', 'green', 'purple', 'everyone'] as const;

export interface Palette {
	/** The page behind the cards. */
	bg: string;
	card: string;
	/** Text, and the one strong fill, such as today's head in the Week view. */
	ink: string;
	/** Text on `ink`. */
	onInk: string;
	/** Text that matters less. */
	dim: string;
	line: string;
	/** Quiet fills: chips, "+N more" and day heads. */
	soft: string;
	/** The bottom bar's track. */
	segment: string;
	/** The view that's showing, on `segment`. */
	selected: string;
	past: string;
	pastHead: string;
	/** The Next up card on the Today view. */
	hero: string;
	onHero: string;
	heroDim: string;
	/** An empty tick box's border. */
	box: string;
	/** The Stars count. */
	starBg: string;
	starFg: string;
	/** A star's outline, and its fill before it's earned. */
	starLine: string;
	starEmpty: string;
	/** Something needs a grown-up: "Sign in needed", "Offline". */
	warnBg: string;
	warnFg: string;
	/** A message that something didn't work, on `card`. */
	problem: string;
	/** A button that removes something. */
	danger: string;
	onDanger: string;
	/** Energy: House use and Car charging bars, and the line along the top of a cheap or Peak Half-hour. */
	house: string;
	car: string;
	cheap: string;
	peak: string;
	/** Behind an Off-peak Half-hour or a Smart-charging slot, the Next cheap tile, and its text. */
	offPeakBg: string;
	slotBg: string;
	cheapFg: string;
	members: Record<(typeof memberColours)[number], MemberColours>;
}

export const palettes: Record<Theme, Palette> = {
	// From the mockups.
	day: {
		bg: '#F3F5F8',
		card: '#FFFFFF',
		ink: '#161B22',
		onInk: '#FFFFFF',
		dim: '#4A5565',
		line: '#C3CBD7',
		soft: '#EDF0F5',
		segment: '#E3E8F0',
		selected: '#FFFFFF',
		past: '#E6EAF1',
		pastHead: '#D5DBE5',
		hero: '#161B22',
		onHero: '#FFFFFF',
		heroDim: '#AEB8C7',
		box: '#5B6676',
		starBg: '#FFF4D6',
		starFg: '#5C3D00',
		starLine: '#8A5A00',
		starEmpty: '#FFFFFF',
		warnBg: '#FFDDB8',
		warnFg: '#6B2E00',
		problem: '#A3201A',
		danger: '#B42318',
		onDanger: '#FFFFFF',
		house: '#4A5565',
		car: '#2456C9',
		cheap: '#2456C9',
		peak: '#B85200',
		offPeakBg: '#D6E4FF',
		slotBg: '#E6EEFF',
		cheapFg: '#0F2F78',
		members: {
			blue: { bg: '#D6E4FF', fg: '#0F2F78', solid: '#2456C9', on: '#FFFFFF' },
			orange: { bg: '#FFDDB8', fg: '#6B2E00', solid: '#B85200', on: '#FFFFFF' },
			green: { bg: '#BDEBDD', fg: '#0A4136', solid: '#0B7A64', on: '#FFFFFF' },
			purple: { bg: '#E6D8FA', fg: '#46228A', solid: '#6C3FC4', on: '#FFFFFF' },
			everyone: { bg: '#E3E6EB', fg: '#1E2530', solid: '#4A5565', on: '#FFFFFF' }
		}
	},
	// From the dark mockup (B · Lanes by person): dimmer, so it's easy on the eyes in a dark kitchen.
	evening: {
		bg: '#0E1116',
		card: '#171C24',
		ink: '#F2F4F8',
		onInk: '#0E1116',
		dim: '#A6B0BF',
		line: '#3A4553',
		soft: '#212A36',
		segment: '#1F2630',
		selected: '#3A4553',
		past: '#12161C',
		pastHead: '#1A2029',
		hero: '#263041',
		onHero: '#F2F4F8',
		heroDim: '#B4BECC',
		box: '#8A94A3',
		starBg: '#3A2E0A',
		starFg: '#FFD98A',
		starLine: '#F5B400',
		starEmpty: 'transparent',
		warnBg: '#4A2A0E',
		warnFg: '#FFD8B0',
		problem: '#FF9C94',
		danger: '#C4362C',
		onDanger: '#FFFFFF',
		house: '#A6B0BF',
		car: '#7FA8FF',
		cheap: '#7FA8FF',
		peak: '#FFA85C',
		offPeakBg: '#1C2B52',
		slotBg: '#1A2438',
		cheapFg: '#C4D6FF',
		members: {
			blue: { bg: '#1C2B52', fg: '#C4D6FF', solid: '#7FA8FF', on: '#0B1A3F' },
			orange: { bg: '#4A2A0E', fg: '#FFD8B0', solid: '#FFA85C', on: '#3A1800' },
			green: { bg: '#0F3B31', fg: '#A9EEDA', solid: '#5ED6B5', on: '#04281F' },
			purple: { bg: '#33235F', fg: '#E0D2FF', solid: '#B99BFF', on: '#24104D' },
			everyone: { bg: '#2A313C', fg: '#DCE1EA', solid: '#A6B0BF', on: '#0E1116' }
		}
	}
};

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The palette as CSS custom properties, for a `style` attribute: `--bg: …; --blue-solid: …`. */
export function cssVariables(palette: Palette): string {
	const { members, ...rest } = palette;
	const vars = Object.entries(rest).map(([name, value]) => `--${kebab(name)}: ${value}`);
	for (const [colour, c] of Object.entries(members)) {
		for (const [part, value] of Object.entries(c)) vars.push(`--${colour}-${part}: ${value}`);
	}
	return vars.join('; ');
}
