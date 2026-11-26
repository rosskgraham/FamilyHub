import type { ServerInit } from '@sveltejs/kit/hooks';
import { checkBackendSignIn } from '#lib/server/backend/index.ts';
import { startLiveUpdates } from '#lib/server/backend/live.ts';
import { onLiveMessage } from '#lib/server/shopping/index.ts';
import { startBackups } from '#lib/server/backup/index.ts';
import { importOldFiles } from '#lib/server/import-files.ts';
import { startTemperatureWatch } from '#lib/server/pi-temperature.ts';
import { markStarted } from '#lib/server/started.ts';

export const init: ServerInit = () => {
	markStarted();
	// Before anything reads the Household: the old files, once (ADR 0012).
	importOldFiles();
	startBackups();
	startTemperatureWatch();
	void checkBackendSignIn();
	startLiveUpdates((list) =>
		onLiveMessage(list).catch((e) =>
			console.error(`Live update for ${list} failed:`, e instanceof Error ? e.message : e)
		)
	);
};
