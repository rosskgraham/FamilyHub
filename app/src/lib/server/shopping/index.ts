import { CALENDAR_SOURCE } from '$app/env/private';
import type { ShoppingItem } from '#lib/shopping.ts';
import { backend } from '../backend/index.ts';
import { liveConnected } from '../backend/live.ts';
import { announceListChanged } from '../changes.ts';
import type { ListResult } from '../tasks/feed.ts';
import { createBackendFeed } from './backend.ts';
import { fakeShopping } from './fake.ts';

export type ShoppingResult = ListResult<ShoppingItem>;

/** The Shopping list: the backend's, once the Hub has its settings and certificate, otherwise a sample one (AB#103). */
export const shopping = createBackendFeed({
	api: () => backend()?.request ?? null,
	sample: fakeShopping,
	sampleOnly: CALENDAR_SOURCE === 'sample',
	live: liveConnected,
	sent: () => announceListChanged('shopping')
});

export const loadShopping = (): Promise<ShoppingResult> => shopping.load();

/** Whether the Shopping list on screen is the backend's, which live updates keep fresh. */
export const shoppingIsLive = (): boolean => CALENDAR_SOURCE !== 'sample' && backend() !== null;

/**
 * A live update from the backend. A change to the Shopping list is fetched, then the screen is told, unless the Hub
 * shows the sample list. Other lists' messages are ignored.
 */
export async function onLiveMessage(list: string): Promise<void> {
	if (list !== 'shopping' || !shoppingIsLive()) return;
	await shopping.refresh();
	announceListChanged('shopping');
}

/** Live updates reconnected, such as after the internet was out, so changes queued meanwhile go now (AB#108). */
export function onLiveConnected(): void {
	shopping
		.sendWaiting()
		.catch((e) => console.error('Shopping list: couldn’t send what was waiting:', e instanceof Error ? e.message : e));
}
