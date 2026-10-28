import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { colours, EVERYONE, household, sampleHousehold, type Household, type MemberConfig } from '#lib/household.ts';

// The real Household's names stay out of Git; household.example.json shows the shape.
const HOUSEHOLD_FILE = 'household.json';

/**
 * The Household from app/household.json, or the sample one if there's no file.
 * Read on every call, so edits show without a restart.
 */
export async function configuredHousehold(): Promise<{ household: Household; fromFile: boolean }> {
	let text: string;
	try {
		text = await readFile(HOUSEHOLD_FILE, 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { household: sampleHousehold, fromFile: false };
		throw e;
	}
	return { household: household(parse(text)), fromFile: true };
}

function parse(text: string): MemberConfig[] {
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
	return members.map((m: Partial<MemberConfig>, i): MemberConfig => {
		const where = `Member ${i + 1} in ${HOUSEHOLD_FILE}`;
		if (typeof m?.name !== 'string' || m.name.trim() === '') error(500, `${where} needs a "name".`);
		if (typeof m.colour !== 'string' || !(m.colour in colours)) {
			error(500, `${where} needs a "colour": one of ${Object.keys(colours).join(', ')}.`);
		}
		const id = m.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
		if (id === EVERYONE || ids.has(id)) error(500, `${where} needs a different name.`);
		ids.add(id);
		const initial = typeof m.initial === 'string' && m.initial !== '' ? m.initial : undefined;
		return { id, name: m.name.trim(), colour: m.colour, initial };
	});
}
