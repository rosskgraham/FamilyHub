import type { ServerInit } from '@sveltejs/kit/hooks';
import { startBackups } from '#lib/server/backup/index.ts';

export const init: ServerInit = () => {
	startBackups();
};
