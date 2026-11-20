import { error } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import type { ChoreConfig } from '#lib/chores.ts';
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
import { getSetting, hubDatabase, setSetting } from './hub-db.ts';
import { transaction } from './sqlite.ts';

// The Household, kept in the Hub's database and managed in Settings (ADR 0012). Until it has a Member, the Hub shows
// the sample Household.

/** Something about a change to the Household that a grown-up can fix, said in words for the screen. */
export class HouseholdError extends Error {}

const NAME_MAX = 30;
const isColour = (c: unknown): c is Colour => typeof c === 'string' && c in colours;

/** The Members, in order, and Everyone's colour, straight from the database. */
export function householdConfig(db: DatabaseSync = hubDatabase()): { members: MemberConfig[]; everyone: Colour } {
	const rows = db.prepare('SELECT id, name, colour, initial FROM members ORDER BY position, rowid').all() as {
		id: string;
		name: string;
		colour: string;
		initial: string | null;
	}[];
	const members = rows.map((r): MemberConfig => ({
		id: r.id,
		name: r.name,
		colour: isColour(r.colour) ? r.colour : EVERYONE_COLOUR,
		...(r.initial ? { initial: r.initial } : {})
	}));
	const everyone = getSetting<string>(db, 'everyoneColour');
	return { members, everyone: isColour(everyone) ? everyone : EVERYONE_COLOUR };
}

/** The real Household, or the sample one until a Member has been added. */
export async function configuredHousehold(): Promise<{ household: Household; configured: boolean }> {
	const { members, everyone } = householdConfig();
	if (members.length === 0) return { household: sampleHousehold, configured: false };
	return { household: household(members, everyone), configured: true };
}

/** An id made from a name, such as "ross", that isn't taken and isn't Everyone's. */
export function memberId(name: string, taken: Set<string>): string {
	const base =
		name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'member';
	let id = base;
	for (let n = 2; id === EVERYONE || taken.has(id); n++) id = `${base}-${n}`;
	return id;
}

function checkName(name: string, others: MemberConfig[]): string {
	const trimmed = name.trim();
	if (trimmed === '') throw new HouseholdError('Type a name.');
	if (trimmed.length > NAME_MAX) throw new HouseholdError(`Keep names to ${NAME_MAX} letters.`);
	if (['everyone', 'family'].includes(trimmed.toLowerCase()))
		throw new HouseholdError(`“${trimmed}” is the Family calendar’s name. Choose another.`);
	const twin = others.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
	if (twin) throw new HouseholdError(`There’s already a ${twin.name}.`);
	return trimmed;
}

function checkColour(colour: unknown, everyone: Colour): Colour {
	if (!isColour(colour)) throw new HouseholdError('Choose a colour.');
	if (colour === everyone)
		throw new HouseholdError('That’s the Family calendar’s colour, so their Events would look alike. Choose another.');
	return colour;
}

/** Adds a Member at the end, and gives back their new id. */
export function addMember(name: string, colour: unknown, db: DatabaseSync = hubDatabase()): string {
	const { members, everyone } = householdConfig(db);
	const checked = checkName(name, members);
	const chosen = checkColour(colour, everyone);
	const id = memberId(checked, new Set(members.map((m) => m.id)));
	db.prepare('INSERT INTO members (id, name, colour, initial, position) VALUES (?, ?, ?, NULL, ?)').run(
		id,
		checked,
		chosen,
		members.length
	);
	return id;
}

/** Renames a Member or changes their colour. Their id stays, so their Calendar and Stars stay theirs. */
export function updateMember(id: string, name: string, colour: unknown, db: DatabaseSync = hubDatabase()): void {
	const { members, everyone } = householdConfig(db);
	if (!members.some((m) => m.id === id)) throw new HouseholdError('That Member has already been removed.');
	const checked = checkName(
		name,
		members.filter((m) => m.id !== id)
	);
	const chosen = checkColour(colour, everyone);
	db.prepare('UPDATE members SET name = ?, colour = ? WHERE id = ?').run(checked, chosen, id);
}

/**
 * Removes a Member and their Calendar choice. Not while they have Chores, which would be left for nobody: those are
 * moved to someone else first. Their Stars stay in the record, as ADR 0006 never deletes what happened.
 */
export function removeMember(id: string, db: DatabaseSync = hubDatabase()): void {
	const member = householdConfig(db).members.find((m) => m.id === id);
	if (!member) return;
	const chores = getSetting<ChoreConfig>(db, 'chores');
	if (chores?.chores.some((c) => c.who.includes(id)))
		throw new HouseholdError(`${member.name} has Chores. Give them to someone else first.`);
	transaction(db, () => {
		db.prepare('DELETE FROM members WHERE id = ?').run(id);
		const calendars = getSetting<Record<string, string>>(db, 'calendars');
		if (calendars && id in calendars) {
			delete calendars[id];
			setSetting(db, 'calendars', calendars);
		}
	});
}

/** Everyone's colour, for the Family calendar. It can't be a Member's. */
export function setEveryoneColour(colour: unknown, db: DatabaseSync = hubDatabase()): void {
	if (!isColour(colour)) throw new HouseholdError('Choose a colour.');
	const twin = householdConfig(db).members.find((m) => m.colour === colour);
	if (twin) throw new HouseholdError(`That’s ${twin.name}’s colour. Choose another for the Family calendar.`);
	setSetting(db, 'everyoneColour', colour);
}

/** Writes a whole Household into an empty one, as the import does. */
export function saveHousehold(members: MemberConfig[], everyone: Colour, db: DatabaseSync = hubDatabase()): void {
	transaction(db, () => {
		const insert = db.prepare('INSERT INTO members (id, name, colour, initial, position) VALUES (?, ?, ?, ?, ?)');
		members.forEach((m, i) => insert.run(m.id, m.name, m.colour, m.initial ?? null, i));
		setSetting(db, 'everyoneColour', everyone);
	});
}

const colourList = () => Object.keys(colours).join(', ');

/** The old household.json, which the Hub imports once (ADR 0012). */
export function parseHousehold(text: string, file = 'household.json'): { members: MemberConfig[]; everyone: Colour } {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		error(500, `${file} isn't valid JSON.`);
	}
	const members = (json as { members?: unknown })?.members;
	if (!Array.isArray(members) || members.length === 0) {
		error(500, `${file} needs a "members" list with at least one Member.`);
	}
	const ids = new Set<string>();
	const parsed = members.map((m: Partial<MemberConfig>, i): MemberConfig => {
		const where = `Member ${i + 1} in ${file}`;
		if (typeof m?.name !== 'string' || m.name.trim() === '') error(500, `${where} needs a "name".`);
		if (!isColour(m.colour)) error(500, `${where} needs a "colour": one of ${colourList()}.`);
		// The same ids as before, so Stars and Calendar choices made with the file carry over.
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
	if (!isColour(everyone)) error(500, `"everyone" in ${file} needs a "colour": one of ${colourList()}.`);
	const twin = parsed.find((m) => m.colour === everyone);
	if (twin) error(500, `Everyone and ${twin.name} are both ${everyone} in ${file}. Choose another colour for one.`);
	return { members: parsed, everyone };
}
