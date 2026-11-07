import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { configPath } from './paths.ts';
import {
	colours,
	EVERYONE,
	EVERYONE_COLOUR,
	household,
	sampleHousehold,
	type Colour,
	type Household,
	type MemberConfig
} from '#lib/household.ts';

// The real Household's names stay out of Git; household.example.json shows the shape.
const HOUSEHOLD_FILE = 'household.json';

/**
 * The Household from household.json, or the sample one if there's no file.
 * Read on every call, so edits show without a restart.
 */
export async function configuredHousehold(): Promise<{ household: Household; fromFile: boolean }> {
	let text: string;
	try {
		text = await readFile(configPath(HOUSEHOLD_FILE), 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { household: sampleHousehold, fromFile: false };
		throw e;
	}
	const { members, everyone } = parseHousehold(text);
	return { household: household(members, everyone), fromFile: true };
}

const colourList = () => Object.keys(colours).join(', ');

export function parseHousehold(text: string): { members: MemberConfig[]; everyone: Colour } {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		error(500, `${HOUSEHOLD_FILE} isn't valid JSON.`);
	}
	const members = (json as { members?: unknown })?.members;
	if (!Array.isArray(members) || members.length === 0) {
		error(500, `${HOUSEHOLD_FILE} needs a "members" list with at least one Member.`);
	}
	const ids = new Set<string>();
	const parsed = members.map((m: Partial<MemberConfig>, i): MemberConfig => {
		const where = `Member ${i + 1} in ${HOUSEHOLD_FILE}`;
		if (typeof m?.name !== 'string' || m.name.trim() === '') error(500, `${where} needs a "name".`);
		if (typeof m.colour !== 'string' || !(m.colour in colours)) {
			error(500, `${where} needs a "colour": one of ${colourList()}.`);
		}
		const id = m.name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-');
		if (id === EVERYONE || ids.has(id)) error(500, `${where} needs a different name.`);
		ids.add(id);
		const initial = typeof m.initial === 'string' && m.initial !== '' ? m.initial : undefined;
		return { id, name: m.name.trim(), colour: m.colour, initial };
	});

	// Everyone's colour is optional, but can't be a Member's, or their Events would look alike.
	const everyone = (json as { everyone?: { colour?: unknown } }).everyone?.colour ?? EVERYONE_COLOUR;
	if (typeof everyone !== 'string' || !(everyone in colours)) {
		error(500, `"everyone" in ${HOUSEHOLD_FILE} needs a "colour": one of ${colourList()}.`);
	}
	const twin = parsed.find((m) => m.colour === everyone);
	if (twin)
		error(500, `Everyone and ${twin.name} are both ${everyone} in ${HOUSEHOLD_FILE}. Choose another colour for one.`);
	return { members: parsed, everyone: everyone as Colour };
}
