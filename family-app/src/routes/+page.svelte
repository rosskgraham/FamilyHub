<script lang="ts">
	import { onMount } from 'svelte';
	import { backendList } from '#lib/api.ts';
	import { msalAuth, type Auth } from '#lib/auth.ts';
	import { readConfig } from '#lib/config.ts';
	import Problem from '#lib/Problem.svelte';
	import Refused from '#lib/Refused.svelte';
	import { CANT_REACH, decide, SIGN_IN_FAILED, type Screen } from '#lib/session.ts';
	import Shopping from '#lib/Shopping.svelte';
	import { ShoppingList, SignedOut } from '#lib/shopping.svelte.ts';
	import SignIn from '#lib/SignIn.svelte';

	const config = readConfig();
	let screen: Screen = $state({ kind: 'loading' });
	let list: ShoppingList | null = $state(null);
	let auth: Auth | null = null;

	async function load() {
		if (!config) {
			screen = { kind: 'not-set-up' };
			return;
		}
		auth ??= msalAuth(config, location.origin);
		list?.stop();
		list = null;
		try {
			const decided = await decide(auth, (token) =>
				fetch(`${config.apiUrl}/me`, { headers: { Authorization: `Bearer ${token}` } })
			);
			if (decided.kind === 'member') {
				const shopping = new ShoppingList(
					backendList(config.apiUrl, () => auth!.token()),
					{ onsignedout: signedOut }
				);
				await shopping.load();
				list = shopping;
			}
			screen = decided;
		} catch (error) {
			if (error instanceof SignedOut) signedOut();
			else screen = { kind: 'problem', message: CANT_REACH };
		}
	}

	// The backend wants a fresh sign-in. Changes not sent yet are lost until the list is kept on the phone (AB#58).
	function signedOut() {
		list?.stop();
		list = null;
		screen = { kind: 'sign-in' };
	}

	onMount(() => {
		void load();
		const changed = () => {
			if (document.visibilityState === 'hidden') list?.hidden();
			else void list?.visible();
		};
		const online = () => void list?.flush();
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
	<Shopping {list} firstName={screen.firstName} initial={screen.initial} onsignout={() => auth?.signOut()} />
{:else if screen.kind === 'refused'}
	<Refused email={screen.email} onanother={() => auth?.anotherAccount()} />
{:else if screen.kind === 'sign-in-failed'}
	<Problem message={SIGN_IN_FAILED} retry="Sign in again" onretry={() => auth?.signIn()} />
{:else if screen.kind === 'problem'}
	<Problem message={screen.message} onretry={load} />
{:else if screen.kind === 'not-set-up'}
	<Problem message="Sign-in isn't set up in this version of the app yet." />
{/if}
