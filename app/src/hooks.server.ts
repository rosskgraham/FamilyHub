import type { ServerInit } from '@sveltejs/kit/hooks';
import { startBackups } from '#lib/server/backup/index.ts';
import { importOldFiles } from '#lib/server/import-files.ts';
import { markStarted } from '#lib/server/started.ts';

export const init: ServerInit = () => {
	markStarted();
	// Before anything reads the Household: the old files, once (ADR 0012).
	importOldFiles();
	startBackups();
};
