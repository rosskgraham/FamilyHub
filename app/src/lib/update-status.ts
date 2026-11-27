// What the Pi's updater last said, for Check for updates in Settings (AB#105). The updater writes it to status.json
// as it goes (ansible/roles/hub/files/update.mjs), and the Hub reads it.

export const updateStates = ['checking', 'up-to-date', 'installing', 'installed', 'failed'] as const;
export type UpdateState = (typeof updateStates)[number];

export interface UpdateStatus {
	state: UpdateState;
	/** The release it's about, such as 2026.11.27.3, or null when it doesn't know one. */
	version: string | null;
	/** Why, when it failed or didn't install. */
	message: string;
	/** When it said so, as an ISO time. */
	at: string;
}

/** How long after asking before saying the updater hasn't started. */
export const NO_ANSWER_MS = 30_000;

/** Whether the updater is still going, so Settings keeps asking. */
export function busy(state: UpdateState): boolean {
	return state === 'checking' || state === 'installing';
}

/** The status, if it's valid JSON from the updater, or null. */
export function parseUpdateStatus(text: string): UpdateStatus | null {
	try {
		const value = JSON.parse(text);
		if (!updateStates.includes(value?.state) || Number.isNaN(Date.parse(value?.at))) return null;
		return {
			state: value.state,
			version: typeof value.version === 'string' ? value.version : null,
			message: typeof value.message === 'string' ? value.message : '',
			at: value.at
		};
	} catch {
		return null;
	}
}

export interface UpdateLine {
	text: string;
	/** Still going: Settings keeps asking, and the button waits. */
	busy: boolean;
	failed: boolean;
}

/**
 * What About this Hub says about updates. `asked` is when Check for updates was pressed, if it was: until the updater
 * says something after that, it's waiting for it to start.
 */
export function describeUpdate(status: UpdateStatus | null, asked: string | null, now: Date): UpdateLine | null {
	const answered = status && (!asked || Date.parse(status.at) >= Date.parse(asked));
	if (asked && !answered) {
		return now.getTime() - Date.parse(asked) < NO_ANSWER_MS
			? { text: 'Asking the Pi to check…', busy: true, failed: false }
			: { text: 'The Pi’s updater hasn’t started. It may not be set up on this Hub.', busy: false, failed: true };
	}
	if (!status) return null;
	const version = status.version ?? 'the latest version';
	switch (status.state) {
		case 'checking':
			return { text: 'Checking for a new version…', busy: true, failed: false };
		case 'installing':
			return { text: `Installing ${version}… The Hub restarts while it does.`, busy: true, failed: false };
		case 'up-to-date':
			return { text: `Up to date: ${version}`, busy: false, failed: false };
		case 'installed':
			return { text: `Installed ${version}`, busy: false, failed: false };
		case 'failed':
			return { text: `Couldn’t update. ${status.message}`.trim(), busy: false, failed: true };
	}
}
