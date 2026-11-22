// Keeps the app itself on the phone, so it opens with no signal, as in a shop (design/family-app/notes.md). Each
// release is a new cache: the new service worker fills it, and the old one is deleted once it takes over, so a new
// release reaches a phone the next time the app opens.
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `family-app-${version}`;
// The single page every path is served (the build's fallback isn't in the manifest), the app's code and the static
// files.
// Static Web Apps reads its own config file but never serves it, and one missing file fails the whole install.
const APP = [
	'/',
	...immutable.map((f) => f.path),
	...assets.map((f) => f.path).filter((path) => !path.endsWith('staticwebapp.config.json'))
];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	// Only the app's own files. Calls to the API go to the network, untouched.
	if (url.origin !== sw.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// Any page is the same single page.
			if (request.mode === 'navigate') return (await cache.match('/')) ?? fetch(request);
			return (await cache.match(request)) ?? fetch(request);
		})()
	);
});
