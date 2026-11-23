import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
	cardFromBranch,
	copyData,
	mainCheckout,
	parseEnv,
	pidOnPort,
	portFor,
	samePath,
	whyNotUpdate
} from './card-dev-lib.ts';

describe('the card and its port', () => {
	it('takes the card from a card branch, and gives it its own port', () => {
		expect(cardFromBranch('ab54-card-dev-server')).toBe(54);
		expect(portFor(54)).toBe(6054);
		expect(portFor(cardFromBranch('ab123-something')!)).toBe(6123);
	});

	it('refuses a branch that isn’t a card’s, or no branch at all', () => {
		expect(cardFromBranch('main')).toBeNull();
		expect(cardFromBranch('ab-no-id')).toBeNull();
		expect(cardFromBranch('feature/ab54-x')).toBeNull();
		expect(cardFromBranch(null)).toBeNull();
	});
});

describe('the main checkout', () => {
	const porcelain = [
		'worktree C:/git/FamilyHub',
		'HEAD beac4ae0000000000000000000000000000000000',
		'detached',
		'',
		'worktree C:/git/FamilyHub/.claude/worktrees/ab54',
		'HEAD dbd730f0000000000000000000000000000000000',
		'branch refs/heads/ab54-card-dev-server',
		''
	].join('\n');

	it('is the first worktree git lists', () => {
		expect(mainCheckout(porcelain)).toBe('C:/git/FamilyHub');
	});

	it('is recognised however the path is spelled', () => {
		expect(samePath('C:/git/FamilyHub', 'c:\\git\\FamilyHub\\')).toBe(true);
		expect(samePath('C:/git/FamilyHub', 'C:/git/FamilyHub/.claude/worktrees/ab54')).toBe(false);
	});

	it('can be moved to origin/main only with nothing changed and no branch', () => {
		expect(whyNotUpdate('', null)).toBeNull();
		expect(whyNotUpdate(' M app/src/app.css\n', null)).toMatch(/changed.*\n M app\/src\/app.css/);
		expect(whyNotUpdate('', 'my-experiment')).toMatch(/branch my-experiment/);
	});
});

describe('the real setup', () => {
	it('reads the .env as Vite does', () => {
		const env = parseEnv(
			[
				'# A comment',
				'GOOGLE_CLIENT_ID=abc.apps.googleusercontent.com',
				'NEST_PROJECT_ID = "with spaces " ',
				"SINGLE='a#b'",
				'TRAILING=value # a comment',
				'export EXPORTED=1',
				'',
				'not a variable'
			].join('\r\n')
		);
		expect(env).toEqual({
			GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com',
			NEST_PROJECT_ID: 'with spaces ',
			SINGLE: 'a#b',
			TRAILING: 'value',
			EXPORTED: '1'
		});
	});
});

describe('finding the dev server on a port', () => {
	const netstat = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1200
  TCP    127.0.0.1:51730        127.0.0.1:5173         ESTABLISHED     8000
  TCP    [::1]:5173             [::]:0                 LISTENING       6196
  TCP    [::1]:6054             [::]:0                 LISTENING       7100
`;

	it('gives the process listening there, not one connected to it', () => {
		expect(pidOnPort(netstat, 5173)).toBe(6196);
		expect(pidOnPort(netstat, 6054)).toBe(7100);
		expect(pidOnPort(netstat, 6046)).toBeNull();
		expect(pidOnPort(netstat, 173)).toBeNull();
	});
});

describe('copying the data', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function rossData() {
		dir = mkdtempSync(join(tmpdir(), 'card-dev-'));
		const from = join(dir, 'main');
		mkdirSync(join(from, 'photos'), { recursive: true });
		writeFileSync(join(from, 'google-token.json'), '{"refresh_token":"r"}');
		writeFileSync(join(from, 'photos', 'one.jpg'), 'jpeg');
		writeFileSync(join(from, 'dev-server.log'), 'Ross’s log');
		// As the Hub opens its database, and left open, as Ross's dev server would have it.
		const db = new DatabaseSync(join(from, 'hub.db'));
		db.exec(
			"PRAGMA journal_mode = WAL; CREATE TABLE settings (key TEXT, value TEXT); INSERT INTO settings VALUES ('theme', 'dark');"
		);
		return { from, to: join(dir, 'card'), db };
	}

	it('copies everything, with each database whole even while it’s open', async () => {
		const { from, to, db } = rossData();
		try {
			expect(existsSync(join(from, 'hub.db-wal'))).toBe(true);
			expect(await copyData(from, to)).toBe('copied');
		} finally {
			db.close();
		}
		expect(readdirSync(to).sort()).toEqual(['google-token.json', 'hub.db', 'photos']);
		expect(readFileSync(join(to, 'google-token.json'), 'utf8')).toBe('{"refresh_token":"r"}');
		expect(readFileSync(join(to, 'photos', 'one.jpg'), 'utf8')).toBe('jpeg');
		const copy = new DatabaseSync(join(to, 'hub.db'));
		expect(copy.prepare('SELECT value FROM settings WHERE key = ?').get('theme')).toEqual({ value: 'dark' });
		copy.close();
	});

	it('keeps the copy on the next start, and its changes stay out of Ross’s', async () => {
		const { from, to, db } = rossData();
		await copyData(from, to);
		const copy = new DatabaseSync(join(to, 'hub.db'));
		copy.exec("UPDATE settings SET value = 'light'");
		copy.close();

		expect(await copyData(from, to)).toBe('kept');
		const kept = new DatabaseSync(join(to, 'hub.db'));
		expect(kept.prepare('SELECT value FROM settings').get()).toEqual({ value: 'light' });
		kept.close();
		expect(db.prepare('SELECT value FROM settings').get()).toEqual({ value: 'dark' });
		db.close();
	});

	it('makes it again with fresh, losing what was only in the copy', async () => {
		const { from, to, db } = rossData();
		db.close();
		await copyData(from, to);
		writeFileSync(join(to, 'only-in-the-copy.json'), '{}');
		expect(await copyData(from, to, true)).toBe('copied');
		expect(existsSync(join(to, 'only-in-the-copy.json'))).toBe(false);
		expect(existsSync(join(to, 'hub.db'))).toBe(true);
	});
});
