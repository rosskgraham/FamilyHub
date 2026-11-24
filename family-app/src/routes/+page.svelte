<script lang="ts">
	import { onMount } from 'svelte';
	import { backendList } from '#lib/api.ts';
	import { msalAuth, type Auth } from '#lib/auth.ts';
	import { readConfig } from '#lib/config.ts';
	import { indexedDbCopy } from '#lib/copy.ts';
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

	async function load() {
		if (!config) {
			screen = { kind: 'not-set-up' };
			return;
		}
		const signIn = (auth ??= msalAuth(config, location.origin));
		list?.stop();
		list = null;
		try {
			await open({
				auth: signIn,
				fetchMe: (token) => fetch(`${config.apiUrl}/me`, { headers: { Authorization: `Bearer ${token}` } }),
				api: backendList(config.apiUrl, () => signIn.token()),
				copy,
				show: (shown, shownList) => {
					if (list && list !== shownList) list.stop();
					list = shownList;
					screen = shown;
				}
			});
		} catch {
			screen = { kind: 'problem', message: CANT_REACH };
		}
	}

	// Sign out clears the list from the phone, so the next person to use it doesn't see it (AB#58).
	async function signOut() {
		list?.stop();
		await copy.clear().catch(() => {});
		await auth?.signOut();
	}

	onMount(() => {
		void load();
		const changed = () => {
			if (document.visibilityState === 'hidden') list?.hidden();
			else void list?.visible();
		};
		const online = () => void list?.visible();
		document.addEventListener('visibilitychange', changed);
		addEventListener('online', online);
		return () => {
			document.removeEventListener('visibilitychange', changed);
			removeEventListener('online', online);
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
