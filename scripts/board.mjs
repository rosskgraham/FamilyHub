#!/usr/bin/env node
// The FamilyHub board in Azure DevOps, for people and agents. See docs/ways-of-working.md.
//
//   node scripts/board.mjs show <id>                 the card: fields, links, comments
//   node scripts/board.mjs next <column> [type]      cards in a column, top priority first
//   node scripts/board.mjs move <id> <column>        to Idea, Refining, Ready, Active, In review or Done
//   node scripts/board.mjs comment <id> < body.html  posts HTML from stdin to the card's discussion
//   node scripts/board.mjs set <id> <title|description|acceptance> < value.html
//                                                    replaces a field with HTML (or text) from stdin
//   node scripts/board.mjs create <type> <title> [parent id] < description.html
//                                                    a new card in Idea, as a child of the parent
//   node scripts/board.mjs attach <id> <file> [caption]
//                                                    attaches a screenshot to the card and shows it in a comment
//   node scripts/board.mjs status <pr> <success|failure|pending> <description>
//                                                    the story-review commit status on the PR's head
//
// Needs the Azure CLI with the azure-devops extension, signed in, and gh. attach also needs AZURE_DEVOPS_EXT_PAT: a
// personal access token with Work Items (Read & write), as az devops invoke can only send JSON. No shell is involved,
// so HTML arrives intact.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const ORG = 'https://rossgraham.visualstudio.com';
const PROJECT = 'FamilyHub';
const TEAM = 'FamilyHub Team';
const REPO = 'rosskgraham/FamilyHub';
const STATUS_CONTEXT = 'story-review';

// Each column's state. Idea, Refining and Ready are all New; the board column says which.
const COLUMNS = {
	Idea: 'New',
	Refining: 'New',
	Ready: 'New',
	Active: 'Active',
	'In review': 'Resolved',
	Done: 'Closed'
};
const BOARD = {
	'User Story': 'Stories',
	Bug: 'Stories',
	Feature: 'Features',
	Epic: 'Epics'
};
const windows = process.platform === 'win32';

// On Windows az is az.cmd, a batch file that only runs through cmd.exe, which mangles <, > and &. So run the Python it
// would run, with no shell, and arguments pass through untouched.
let azExe;
function azCommand() {
	if (!windows) return ['az', []];
	const cmd = new TextDecoder()
		.decode(spawnSync('where', ['az']).stdout)
		.split(/\r?\n/)
		.find((p) => /\.cmd$/i.test(p));
	if (!cmd) throw new Error('The Azure CLI is not installed.');
	return [join(dirname(cmd), '..', 'python.exe'), ['-IBm', 'azure.cli']];
}

function run(command, args, { input } = {}) {
	let exe = command;
	if (command === 'az') {
		azExe ??= azCommand();
		[exe, args] = [azExe[0], [...azExe[1], ...args]];
	}
	const result = spawnSync(exe, args, { input });
	// The Azure CLI's Python runs isolated (-I), so it ignores PYTHONIOENCODING and writes cp1252 on Windows.
	const decoder = new TextDecoder(windows && command === 'az' ? 'windows-1252' : 'utf-8');
	const out = decoder.decode(result.stdout);
	if (result.status !== 0) {
		const err = decoder.decode(result.stderr);
		throw new Error(`${command} ${args.slice(-6, -3).join(' ')} failed:\n${err || out}`);
	}
	return out;
}

const az = (...args) => JSON.parse(run('az', [...args, '--org', ORG, '-o', 'json']) || 'null');

/** az devops invoke with a JSON body from a file. */
function invoke({ area, resource, route, method = 'GET', body, version = '7.1', mediaType }) {
	const dir = mkdtempSync(join(tmpdir(), 'board-'));
	try {
		const args = ['devops', 'invoke', '--area', area, '--resource', resource, '--http-method', method];
		args.push('--route-parameters', ...Object.entries(route).map(([k, v]) => `${k}=${v}`));
		args.push('--api-version', version);
		if (body !== undefined) {
			const file = join(dir, 'body.json');
			writeFileSync(file, JSON.stringify(body), 'utf8');
			args.push('--in-file', file);
		}
		if (mediaType) args.push('--media-type', mediaType);
		return az(...args);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// az devops invoke can't address one work item by id, so reading and moving use az boards.
const workItem = (id) => az('boards', 'work-item', 'show', '--id', String(id));

// The relations come from a separate call, as az devops invoke can't add $expand.
const relations = (id) => az('boards', 'work-item', 'relation', 'show', '--id', String(id)).relations ?? [];

const comments = (id) =>
	invoke({
		area: 'wit',
		resource: 'comments',
		route: { project: PROJECT, workItemId: id },
		version: '7.1-preview'
	}).comments ?? [];

const columnFields = {};
function columnField(type) {
	const board = BOARD[type];
	if (!board) throw new Error(`No board for ${type}`);
	columnFields[board] ??= invoke({
		area: 'work',
		resource: 'boards',
		route: { project: PROJECT, team: TEAM, id: board }
	}).fields.columnField.referenceName;
	return columnFields[board];
}

/** HTML to plain text that's good enough to read in a terminal. */
const text = (html = '') =>
	html
		.replace(/<li>/gi, '\n- ')
		.replace(/<\/(p|div|h\d|ul|ol|tr)>|<br\s*\/?>/gi, '\n')
		.replace(/<h(\d)>/gi, (_, n) => '\n' + '#'.repeat(Number(n)) + ' ')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

function show(id) {
	const item = workItem(id);
	const f = item.fields;
	const lines = [
		`#${item.id} ${f['System.WorkItemType']}: ${f['System.Title']}`,
		`State: ${f['System.State']} · Column: ${f['System.BoardColumn'] ?? '-'} · Tags: ${f['System.Tags'] ?? '-'}`
	];
	for (const r of relations(id)) {
		const target = r.url.split('/').pop();
		if (r.rel === 'System.LinkTypes.Hierarchy-Reverse') lines.push(`Parent: #${target}`);
		else if (r.rel === 'System.LinkTypes.Hierarchy-Forward') lines.push(`Child: #${target}`);
		else if (r.rel === 'ArtifactLink') lines.push(`Linked: ${r.attributes?.name ?? ''} ${decodeURIComponent(r.url)}`);
		else if (r.rel === 'Hyperlink') lines.push(`Link: ${r.url}`);
	}
	const description = f['System.Description'] ?? f['Microsoft.VSTS.TCM.ReproSteps'];
	if (description) lines.push('', '## Description', text(description));
	if (f['Microsoft.VSTS.Common.AcceptanceCriteria'])
		lines.push('', '## Acceptance criteria', text(f['Microsoft.VSTS.Common.AcceptanceCriteria']));
	const discussion = comments(id).sort((a, b) => a.id - b.id);
	if (discussion.length) {
		lines.push('', '## Discussion (oldest first)');
		for (const c of discussion) lines.push('', `--- ${c.createdDate} ${c.createdBy?.displayName ?? ''}`, text(c.text));
	}
	console.log(lines.join('\n'));
}

function next(column, type) {
	if (!(column in COLUMNS)) throw new Error(`Column must be one of: ${Object.keys(COLUMNS).join(', ')}`);
	const types = type ? [type] : Object.keys(BOARD).filter((t) => t !== 'Epic');
	const query =
		`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}' ` +
		`AND [System.WorkItemType] IN (${types.map((t) => `'${t}'`).join(', ')}) ` +
		`AND [System.BoardColumn] = '${column}' ORDER BY [Microsoft.VSTS.Common.StackRank] ASC, [System.Id] ASC`;
	const ids = invoke({
		area: 'wit',
		resource: 'wiql',
		route: { project: PROJECT },
		method: 'POST',
		body: { query }
	}).workItems.map((w) => w.id);
	for (const id of ids) {
		const f = workItem(id).fields;
		console.log(`#${id}\t${f['System.WorkItemType']}\t${f['System.Title']}`);
	}
	if (!ids.length) console.log(`Nothing in ${column}.`);
}

function move(id, column) {
	if (!(column in COLUMNS)) throw new Error(`Column must be one of: ${Object.keys(COLUMNS).join(', ')}`);
	const type = workItem(id).fields['System.WorkItemType'];
	const item = az(
		'boards',
		'work-item',
		'update',
		'--id',
		String(id),
		'--state',
		COLUMNS[column],
		'--fields',
		`${columnField(type)}=${column}`
	);
	console.log(`#${id} is in ${item.fields['System.BoardColumn'] ?? column} (${item.fields['System.State']}).`);
}

function comment(id) {
	const html = readFileSync(0, 'utf8').trim();
	if (!html) throw new Error('Send the comment as HTML on stdin.');
	const posted = invoke({
		area: 'wit',
		resource: 'comments',
		route: { project: PROJECT, workItemId: id },
		method: 'POST',
		body: { text: html },
		version: '7.1-preview'
	});
	console.log(`Posted comment ${posted.id} on #${id}.`);
}

const FIELDS = {
	title: 'System.Title',
	description: 'System.Description',
	acceptance: 'Microsoft.VSTS.Common.AcceptanceCriteria'
};

function set(id, field) {
	if (!FIELDS[field]) throw new Error(`Field must be one of: ${Object.keys(FIELDS).join(', ')}`);
	const value = readFileSync(0, 'utf8').trim();
	if (!value) throw new Error('Send the new value on stdin.');
	const update = (name) => az('boards', 'work-item', 'update', '--id', String(id), '--fields', `${name}=${value}`);
	// A Bug shows Repro Steps where a story shows its Description, so it gets both.
	if (field === 'description' && workItem(id).fields['System.WorkItemType'] === 'Bug')
		update('Microsoft.VSTS.TCM.ReproSteps');
	update(FIELDS[field]);
	console.log(`Updated the ${field} of #${id}.`);
}

function create(type, title, parent) {
	if (!BOARD[type]) throw new Error(`Type must be one of: ${Object.keys(BOARD).join(', ')}`);
	if (!title) throw new Error('Give the new card a title.');
	const description = process.stdin.isTTY ? '' : readFileSync(0, 'utf8').trim();
	const args = ['boards', 'work-item', 'create', '--project', PROJECT, '--type', type, '--title', title];
	if (description) args.push('--description', description);
	const item = az(...args);
	if (parent)
		az(
			'boards',
			'work-item',
			'relation',
			'add',
			'--id',
			String(item.id),
			'--relation-type',
			'parent',
			'--target-id',
			String(parent)
		);
	console.log(`Created #${item.id} ${type}: ${title}${parent ? `, under #${parent}` : ''}.`);
}

/** Uploads a file, attaches it to the card, and shows it in a comment, so a screenshot is part of the record. */
async function attach(id, file, caption = '') {
	const pat = process.env.AZURE_DEVOPS_EXT_PAT;
	if (!pat)
		throw new Error(
			'attach needs AZURE_DEVOPS_EXT_PAT: a token with Work Items (Read & write). See docs/ways-of-working.md.'
		);
	const auth = {
		Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
	};
	const name = basename(file);
	const upload = await fetch(
		`${ORG}/${PROJECT}/_apis/wit/attachments?fileName=${encodeURIComponent(name)}&api-version=7.1`,
		{
			method: 'POST',
			headers: { ...auth, 'Content-Type': 'application/octet-stream' },
			body: readFileSync(file)
		}
	);
	if (!upload.ok) throw new Error(`Uploading ${name} failed: ${upload.status} ${await upload.text()}`);
	const { url } = await upload.json();
	const link = await fetch(`${ORG}/${PROJECT}/_apis/wit/workitems/${id}?api-version=7.1`, {
		method: 'PATCH',
		headers: { ...auth, 'Content-Type': 'application/json-patch+json' },
		body: JSON.stringify([
			{
				op: 'add',
				path: '/relations/-',
				value: { rel: 'AttachedFile', url, attributes: { comment: caption } }
			}
		])
	});
	if (!link.ok) throw new Error(`Attaching ${name} to #${id} failed: ${link.status} ${await link.text()}`);
	const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const image = /\.(png|jpe?g|gif|webp)$/i.test(name);
	const html =
		(caption ? `<p>${escape(caption)}</p>` : '') +
		(image
			? `<p><img src="${url}" alt="${escape(caption || name)}"></p>`
			: `<p><a href="${url}">${escape(name)}</a></p>`);
	const posted = invoke({
		area: 'wit',
		resource: 'comments',
		route: { project: PROJECT, workItemId: id },
		method: 'POST',
		body: { text: html },
		version: '7.1-preview'
	});
	console.log(`Attached ${name} to #${id} and showed it in comment ${posted.id}.`);
}

function status(pr, state, description) {
	if (!['success', 'failure', 'pending'].includes(state)) throw new Error('State must be success, failure or pending.');
	const sha = run('gh', ['pr', 'view', String(pr), '--repo', REPO, '--json', 'headRefOid', '-q', '.headRefOid']).trim();
	run('gh', ['api', '--method', 'POST', `repos/${REPO}/statuses/${sha}`, '--input', '-'], {
		input: JSON.stringify({
			state,
			context: STATUS_CONTEXT,
			description: (description ?? '').slice(0, 140)
		})
	});
	console.log(`${STATUS_CONTEXT} is ${state} on PR #${pr} (${sha.slice(0, 7)}).`);
}

const [command, ...args] = process.argv.slice(2);
const commands = { show, next, move, comment, set, create, attach, status };
try {
	if (!commands[command])
		throw new Error(
			'Usage: node scripts/board.mjs show|next|move|comment|set|create|attach|status … (see the top of this file)'
		);
	await commands[command](...args);
} catch (e) {
	console.error(e.message);
	process.exit(1);
}
