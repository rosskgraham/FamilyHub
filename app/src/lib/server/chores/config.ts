import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { CHORE_ICONS, WEEKDAYS, type Chore, type ChoreConfig, type Routine } from '#lib/chores.ts';
import { EVERYONE, type Household } from '#lib/household.ts';

// The real Chores stay out of Git beside household.json; chores.example.json shows the shape.
const CHORES_FILE = 'chores.json';

/** Sample Chores for the sample Household's children, Maya and Leo. */
export const sampleChores: ChoreConfig = {
	routines: [
		{ id: 'morning', name: 'Morning', from: '06:30' },
		{ id: 'after-school', name: 'After school', from: '15:30' },
		{ id: 'evening', name: 'Evening', from: '18:00' }
	],
	chores: [
		{ id: 'teeth', name: 'Brush your teeth', icon: 'teeth', stars: 1, routines: ['morning', 'evening'], who: ['maya', 'leo'] },
		{ id: 'bed', name: 'Make your bed', icon: 'bed', stars: 1, routines: ['morning'], who: ['maya', 'leo'] },
		{ id: 'dressed', name: 'Get dressed', icon: 'shirt', stars: 1, routines: ['morning'], who: ['maya', 'leo'] },
		{ id: 'room', name: 'Tidy your room', icon: 'home', stars: 2, routines: ['after-school'], who: ['maya'] },
		{ id: 'piano', name: 'Piano practice', icon: 'music', stars: 2, routines: ['after-school'], who: ['maya'], days: ['Mon', 'Wed', 'Fri'] },
		{ id: 'reading', name: 'Reading, 10 minutes', icon: 'book', stars: 2, routines: ['after-school'], who: ['leo'] },
		{ id: 'bins', name: 'Put the bins out', icon: 'bin', stars: 3, routines: ['evening'], who: ['leo'], days: ['Wed'] },
		{ id: 'pyjamas', name: 'Pyjamas on', icon: 'shirt', stars: 1, routines: ['evening'], who: ['maya', 'leo'] }
	]
};

/** The Chores from app/chores.json, or null if there's no file. Read on every call, so edits show without a restart. */
export async function configuredChores(household: Household): Promise<ChoreConfig | null> {
	let text: string;
	try {
		text = await readFile(CHORES_FILE, 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw e;
	}
	return parseChores(text, household);
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseChores(text: string, household: Household): ChoreConfig {
	let json: { routines?: unknown; chores?: unknown };
	try {
		json = JSON.parse(text);
	} catch {
		error(500, `${CHORES_FILE} isn't valid JSON.`);
	}
	if (!Array.isArray(json?.routines) || json.routines.length === 0) {
		error(500, `${CHORES_FILE} needs a "routines" list with at least one Routine.`);
	}
	if (!Array.isArray(json.chores) || json.chores.length === 0) {
		error(500, `${CHORES_FILE} needs a "chores" list with at least one Chore.`);
	}

	const routineIds = new Set<string>();
	const routines = json.routines.map((r: Partial<Routine>, i): Routine => {
		const where = `Routine ${i + 1} in ${CHORES_FILE}`;
		if (typeof r?.id !== 'string' || !ID.test(r.id) || routineIds.has(r.id)) {
			error(500, `${where} needs a unique "id" of lower-case letters, digits and dashes.`);
		}
		if (typeof r.name !== 'string' || r.name.trim() === '') error(500, `${where} needs a "name".`);
		if (typeof r.from !== 'string' || !TIME.test(r.from)) error(500, `${where} needs a "from" time, such as "06:30".`);
		routineIds.add(r.id);
		return { id: r.id, name: r.name.trim(), from: r.from };
	});
	if (routines.some((r, i) => i > 0 && r.from <= routines[i - 1]!.from)) {
		error(500, `The Routines in ${CHORES_FILE} need to be in the order they happen, each starting later than the one before.`);
	}

	const choreIds = new Set<string>();
	const chores = json.chores.map((c: Partial<Chore>, i): Chore => {
		const where = typeof c?.id === 'string' ? `Chore "${c.id}" in ${CHORES_FILE}` : `Chore ${i + 1} in ${CHORES_FILE}`;
		if (typeof c?.id !== 'string' || !ID.test(c.id) || choreIds.has(c.id)) {
			error(500, `${where} needs a unique "id" of lower-case letters, digits and dashes.`);
		}
		if (typeof c.name !== 'string' || c.name.trim() === '') error(500, `${where} needs a "name".`);
		if (typeof c.icon !== 'string' || !(CHORE_ICONS as readonly string[]).includes(c.icon)) {
			error(500, `${where} needs an "icon": one of ${CHORE_ICONS.join(', ')}.`);
		}
		if (!Number.isInteger(c.stars) || c.stars! < 1 || c.stars! > 3) error(500, `${where} needs "stars" from 1 to 3.`);
		if (!Array.isArray(c.routines) || c.routines.length === 0 || !c.routines.every((r) => routineIds.has(r))) {
			error(500, `${where} needs "routines": a list of Routine ids, from ${[...routineIds].join(', ')}.`);
		}
		const members = Object.values(household).filter((m) => m.id !== EVERYONE);
		const names = members.map((m) => m.name).join(', ');
		if (!Array.isArray(c.who) || c.who.length === 0) {
			error(500, `${where} needs "who": a list of Members from household.json, from ${names}.`);
		}
		// A Member by their name or id, whatever the capitals.
		const who = c.who.map((w) => {
			const found = typeof w === 'string' && members.find((m) => [m.id, m.name.toLowerCase()].includes(w.trim().toLowerCase()));
			if (!found) error(500, `${where} is for "${w}", who isn't in household.json. Members are ${names}.`);
			return found.id;
		});
		if (c.days !== undefined && (!Array.isArray(c.days) || c.days.length === 0 || !c.days.every((d) => (WEEKDAYS as readonly string[]).includes(d)))) {
			error(500, `${where} has "days" that aren't ${WEEKDAYS.join(', ')}.`);
		}
		choreIds.add(c.id);
		return {
			id: c.id,
			name: c.name.trim(),
			icon: c.icon as Chore['icon'],
			stars: c.stars!,
			routines: [...new Set(c.routines)],
			who: [...new Set(who)],
			...(c.days ? { days: [...new Set(c.days)] } : {})
		};
	});
	return { routines, chores };
}
