import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChoreEvent } from '#lib/chores.ts';
import { openChoreStore } from './store.ts';

const tick: ChoreEvent = {
	at: '2026-10-28T08:00:00.000Z',
	day: '2026-10-28',
	child: 'maya',
	chore: 'bed',
	routine: 'morning',
	ticked: true,
	stars: 1
};
const untick: ChoreEvent = { ...tick, at: '2026-10-28T08:01:00.000Z', ticked: false, stars: 0 };

let folder: string | undefined;
afterEach(() => {
	if (folder) rmSync(folder, { recursive: true, force: true });
	folder = undefined;
});

describe('openChoreStore', () => {
	it('records events and gives them back oldest first', () => {
		const store = openChoreStore(':memory:');
		store.record(tick);
		store.record(untick);
		expect(store.events()).toEqual([tick, untick]);
	});

	it('keeps them when the database is opened again, creating its folder', () => {
		folder = mkdtempSync(join(tmpdir(), 'familyhub-'));
		const path = join(folder, 'data', 'hub.db');
		const first = openChoreStore(path);
		first.record(tick);
		first.close();
		const again = openChoreStore(path);
		expect(again.events()).toEqual([tick]);
		again.close();
	});
});
