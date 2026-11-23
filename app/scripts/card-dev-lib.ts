// What scripts/card-dev.mjs decides, kept apart from what it runs so it can be tested (AB#54). Node runs this file
// as it is, so it uses only Node's own modules and TypeScript that can be stripped away.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

/** Where Ross's own dev server listens. */
export const MAIN_PORT = 5173;
/** A card's dev server listens on this plus its id, so its address stays the same for the card's life. */
export const CARD_PORT_BASE = 6000;
/** Where a dev server started by the script logs, in its data folder. */
export const LOG_FILE = 'dev-server.log';

/** The card a branch is for, from its name, `ab<id>-<short-name>`, or null. */
export function cardFromBranch(branch: string | null): number | null {
	const id = /^ab(\d+)-/.exec(branch ?? '')?.[1];
	return id ? Number(id) : null;
}

export function portFor(card: number): number {
	return CARD_PORT_BASE + card;
}

/** The main checkout, which `git worktree list --porcelain` always gives first. */
export function mainCheckout(porcelain: string): string {
	const path = /^worktree (.+)$/m.exec(porcelain)?.[1];
	if (!path) throw new Error('git worktree list gave no worktrees.');
	return path.trim();
}

/** The same folder, however git or Windows spelled it. */
export function samePath(a: string, b: string): boolean {
	const tidy = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
	return tidy(a) === tidy(b);
}

/** A .env file's variables, as Vite reads them: `NAME=value`, with # comments and optional quotes. */
export function parseEnv(text: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const line of text.split(/\r?\n/)) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match) continue;
		const [, name, raw] = match as unknown as [string, string, string];
		const quoted = /^(['"`])([\s\S]*)\1$/.exec(raw);
		env[name] = quoted ? quoted[2]! : raw.replace(/\s+#.*$/, '');
	}
	return env;
}

/** Why the main checkout can't be moved to origin/main, or null if it can. */
export function whyNotUpdate(status: string, branch: string | null): string | null {
	if (status.trim()) return `Something in the main checkout is changed, so it's left alone:\n${status.trimEnd()}`;
	if (branch) return `The main checkout is on the branch ${branch}, so it's left alone.`;
	return null;
}

/** The process listening on a port, from `netstat -ano` on Windows, or null. */
export function pidOnPort(netstat: string, port: number): number | null {
	for (const line of netstat.split(/\r?\n/)) {
		const [proto, local, , state, pid] = line.trim().split(/\s+/);
		if (proto === 'TCP' && state === 'LISTENING' && local?.endsWith(`:${port}`) && pid) return Number(pid);
	}
	return null;
}

export type CopyResult = 'copied' | 'kept';

/**
 * Copies a data folder for a card's dev server. Each database goes through SQLite's backup, so the copy is whole even
 * while Ross's dev server has it open, and without its -wal and -shm files, which the backup takes in. Everything else
 * is copied as it is, apart from what a dev server started by the script writes. A copy already there is kept unless
 * `fresh`.
 */
export async function copyData(from: string, to: string, fresh = false): Promise<CopyResult> {
	if (existsSync(to) && !fresh) return 'kept';
	rmSync(to, { recursive: true, force: true });
	await copyFolder(from, to);
	return 'copied';
}

async function copyFolder(from: string, to: string): Promise<void> {
	mkdirSync(to, { recursive: true });
	if (!existsSync(from)) return;
	for (const entry of readdirSync(from, { withFileTypes: true })) {
		const source = join(from, entry.name);
		const target = join(to, entry.name);
		if (entry.isDirectory()) await copyFolder(source, target);
		else if (/\.db-(wal|shm|journal)$/.test(entry.name) || entry.name === LOG_FILE) continue;
		else if (entry.name.endsWith('.db')) {
			const db = new DatabaseSync(source, { readOnly: true });
			try {
				await backup(db, target);
			} finally {
				db.close();
			}
		} else copyFileSync(source, target);
	}
}
