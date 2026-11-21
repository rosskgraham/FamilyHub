#!/usr/bin/env node
// Starts an independent review of a card's PR: /review-story in a new, headless Claude Code session, in a fresh worktree
// at the PR's latest commit. See docs/ways-of-working.md.
//
//   node scripts/review-story.mjs <id> [--pr <number>]
//
// It takes only the card's number, on purpose: the session that wrote the code can't brief the reviewer. The reviewer
// can read and run tests but not edit, commit or push. It posts its own verdict; if it doesn't finish, this marks the
// story-review status red so the PR can't merge unreviewed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'rosskgraham/FamilyHub';
const windows = process.platform === 'win32';
const here = dirname(fileURLToPath(import.meta.url));

// What the reviewer may do. Anything else is refused, as nobody is there to approve it.
const ALLOWED = [
	'Read',
	'Grep',
	'Glob',
	'Skill',
	'Bash(node scripts/board.mjs:*)',
	'Bash(gh pr view:*)',
	'Bash(gh pr diff:*)',
	'Bash(gh pr checks:*)',
	'Bash(gh pr list:*)',
	'Bash(gh pr comment:*)',
	'Bash(git log:*)',
	'Bash(git diff:*)',
	'Bash(git show:*)',
	'Bash(git status:*)',
	'Bash(git rev-parse:*)',
	'Bash(cd:*)',
	'Bash(ls:*)',
	'Bash(npm test:*)',
	'Bash(npm run check:*)',
	'Bash(npm run lint:*)',
	'Bash(npx vitest:*)',
	'Bash(npx playwright test:*)',
	'Bash(npx prettier --check:*)',
	'Bash(npx eslint:*)',
	'Bash(uv run pytest:*)',
	'Bash(uv run ruff check:*)',
	'Bash(uv sync:*)',
	'Bash(az bicep build:*)'
];
const DISALLOWED = ['Edit', 'Write', 'NotebookEdit', 'Agent'];

const where = (name) =>
	new TextDecoder()
		.decode(spawnSync('where', [name]).stdout)
		.split(/\r?\n/)
		.find((p) => /\.(cmd|exe)$/i.test(p));

/** Runs a command and returns its output, failing loudly. */
function run(command, args, { cwd, quiet } = {}) {
	const exe = windows ? (where(command) ?? command) : command;
	const options = {
		cwd,
		maxBuffer: 64 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'pipe']
	};
	// Only a .cmd (npm) needs cmd.exe; its arguments here are plain words.
	const result =
		windows && /\.cmd$/i.test(exe)
			? spawnSync([exe, ...args].map((a) => `"${a}"`).join(' '), {
					...options,
					shell: true
				})
			: spawnSync(exe, args, options);
	const out = new TextDecoder().decode(result.stdout);
	if (result.status !== 0) {
		if (quiet) return null;
		throw new Error(
			`${command} ${args.slice(0, 3).join(' ')} failed:\n${new TextDecoder().decode(result.stderr) || out}`
		);
	}
	return out;
}

const board = (...args) => run('node', [join(here, 'board.mjs'), ...args]);

function findPr(id, given) {
	if (given) return JSON.parse(run('gh', ['pr', 'view', given, '--repo', REPO, '--json', 'number,headRefOid,state']));
	const prs = JSON.parse(
		run('gh', [
			'pr',
			'list',
			'--repo',
			REPO,
			'--state',
			'open',
			'--search',
			`AB#${id}`,
			'--json',
			'number,headRefOid,state'
		])
	);
	if (prs.length !== 1)
		throw new Error(`Found ${prs.length} open PRs mentioning AB#${id}. Say which with --pr <number>.`);
	return prs[0];
}

const reviewState = (sha) =>
	JSON.parse(run('gh', ['api', `repos/${REPO}/commits/${sha}/status`])).statuses.find(
		(s) => s.context === 'story-review'
	)?.state;

const [id, flag, prArg] = process.argv.slice(2);
if (!/^\d+$/.test(id ?? '') || (flag && flag !== '--pr')) {
	console.error('Usage: node scripts/review-story.mjs <id> [--pr <number>]');
	process.exit(1);
}

const pr = findPr(id, prArg);
if (pr.state && pr.state !== 'OPEN') throw new Error(`PR #${pr.number} is ${pr.state}.`);
const sha = pr.headRefOid;
const root = resolve(run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim(), '..');
const worktree = join(root, '.claude', 'worktrees', `review-${pr.number}-${sha.slice(0, 7)}`);
const logs = join(root, '.claude', 'worktrees', 'review-logs');
mkdirSync(logs, { recursive: true });

board('status', sha, 'pending', `Independent review of AB#${id} running`);
console.log(`Reviewing AB#${id}: PR #${pr.number} at ${sha.slice(0, 7)}, in ${worktree}`);

let verdict;
try {
	run('git', ['fetch', '--quiet', 'origin', `pull/${pr.number}/head`], {
		cwd: root
	});
	if (!existsSync(worktree))
		run('git', ['worktree', 'add', '--quiet', '--detach', worktree, sha], {
			cwd: root
		});
	if (existsSync(join(worktree, 'app', 'package-lock.json'))) {
		console.log('Installing the app’s packages for the reviewer…');
		run('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], {
			cwd: join(worktree, 'app')
		});
	}

	console.log('Starting the reviewer. This takes several minutes.');
	const out = run(
		'claude',
		[
			'-p',
			`/review-story ${id} ${pr.number}`,
			'--output-format',
			'json',
			'--no-session-persistence',
			'--strict-mcp-config',
			'--allowedTools',
			...ALLOWED,
			'--disallowedTools',
			...DISALLOWED
		],
		{ cwd: worktree, quiet: true }
	);
	const log = join(logs, `AB${id}-PR${pr.number}-${sha.slice(0, 7)}.json`);
	if (out) writeFileSync(log, out);
	const result = out ? JSON.parse(out) : null;
	if (result) console.log(`\n${result.result}\n\nCost $${result.total_cost_usd?.toFixed(2)} · log ${log}`);
	verdict = reviewState(sha);
} catch (e) {
	console.error(e.message);
} finally {
	run('git', ['worktree', 'remove', '--force', worktree], {
		cwd: root,
		quiet: true
	});
}

if (verdict === 'success' || verdict === 'failure') {
	console.log(`story-review: ${verdict === 'success' ? 'approved' : 'changes requested'}.`);
} else {
	board('status', sha, 'failure', 'The review did not finish. Run it again.');
	console.error('The reviewer did not post a verdict, so story-review is red. Run it again.');
	process.exit(1);
}
