<script lang="ts">
	import { onMount } from 'svelte';
	import { backendList, type BackendList } from '#lib/api.ts';
	import { msalAuth, type Auth } from '#lib/auth.ts';
	import { readConfig } from '#lib/config.ts';
	import { indexedDbCopy } from '#lib/copy.ts';
	import { Live } from '#lib/live.ts';
	import Problem from '#lib/Problem.svelte';
	import Refused from '#lib/Refused.svelte';
	import { CANT_REACH, open, SIGN_IN_FAILED, type Screen } from '#lib/session.ts';
	import Shopping from '#lib/Shopping.svelte';
	import type { ShoppingList } from '#lib/shopping.svelte.ts';
	import SignIn from '#lib/SignIn.svelte';

	const config = readConfig();
	const copy = indexedDbCopy();
	let screen: Screen = $state({ kind: 'loading' });
	let list: ShoppingList | null = $state(null);
	let auth: Auth | null = null;
	// Live updates for the list showing, while the app's in front (AB#59).
	let live: Live | null = null;

	function showList(shown: ShoppingList | null, api: BackendList) {
		if (list && list !== shown) list.stop();
		if (list === shown) return;
		live?.stop();
		live = null;
		list = shown;
		if (!shown) return;
		live = new Live({
			liveUrl: () => api.liveUrl(),
			onchanged: (changed, seq) => {
				if (changed === 'shopping') void shown.heard(seq);
			},
			onconnected: () => void shown.catchUp(),
			onsignedout: () => shown.signedOut()
		});
		if (document.visibilityState !== 'hidden') live.start();
	}

	async function load() {
		if (!config) {
			screen = { kind: 'not-set-up' };
			return;
		}
		const signIn = (auth ??= msalAuth(config, location.origin));
		const api = backendList(config.apiUrl, () => signIn.token());
		showList(null, api);
		try {
			await open({
				auth: signIn,
				fetchMe: (token) => fetch(`${config.apiUrl}/me`, { headers: { Authorization: `Bearer ${token}` } }),
				api,
				copy,
				show: (shown, shownList) => {
					showList(shownList, api);
					screen = shown;
				}
			});
		} catch {
			screen = { kind: 'problem', message: CANT_REACH };
		}
	}

	// Sign out clears the list from the phone, so the next person to use it doesn't see it (AB#58).
	async function signOut() {
		live?.stop();
		list?.stop();
		await copy.clear().catch(() => {});
		await auth?.signOut();
	}

	onMount(() => {
		void load();
		const changed = () => {
			if (document.visibilityState === 'hidden') {
				list?.hidden();
				live?.stop();
			} else {
				void list?.visible();
				live?.start();
			}
		};
		const online = () => void list?.visible();
		document.addEventListener('visibilitychange', changed);
		addEventListener('online', online);
		return () => {
			document.removeEventListener('visibilitychange', changed);
			removeEventListener('online', online);
			live?.stop();
			list?.stop();
		};
	});
</script>

{#if screen.kind === 'sign-in'}
	<SignIn onsignin={() => auth?.signIn()} />
{:else if screen.kind === 'member' && list}
	<Shopping
		{list}
		firstName={screen.firstName}
		initial={screen.initial}
		onsignout={signOut}
		onsignin={() => auth?.signIn()}
	/>
{:else if screen.kind === 'refused'}
	<Refused email={screen.email} onanother={() => auth?.anotherAccount()} />
{:else if screen.kind === 'sign-in-failed'}
	<Problem message={SIGN_IN_FAILED} retry="Sign in again" onretry={() => auth?.signIn()} />
{:else if screen.kind === 'problem'}
	<Problem message={screen.message} onretry={load} />
{:else if screen.kind === 'not-set-up'}
	<Problem message="Sign-in isn't set up in this version of the app yet." />
{/if}
