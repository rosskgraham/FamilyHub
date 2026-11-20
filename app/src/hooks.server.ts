import type { ServerInit } from '@sveltejs/kit/hooks';
import { startBackups } from '#lib/server/backup/index.ts';
import { markStarted } from '#lib/server/started.ts';

export const init: ServerInit = () => {
	markStarted();
	startBackups();
};
