<script lang="ts">
	import { onMount } from 'svelte';
	import { msalAuth, type Auth } from '#lib/auth.ts';
	import { readConfig } from '#lib/config.ts';
	import Problem from '#lib/Problem.svelte';
	import Refused from '#lib/Refused.svelte';
	import { CANT_REACH, decide, type Screen } from '#lib/session.ts';
	import SignedIn from '#lib/SignedIn.svelte';
	import SignIn from '#lib/SignIn.svelte';

	const config = readConfig();
	let screen: Screen = $state({ kind: 'loading' });
	let auth: Auth | null = null;

	async function load() {
		if (!config) {
			screen = { kind: 'not-set-up' };
			return;
		}
		auth ??= msalAuth(config, location.origin);
		try {
			screen = await decide(auth, (token) =>
				fetch(`${config.apiUrl}/me`, { headers: { Authorization: `Bearer ${token}` } })
			);
		} catch {
			screen = { kind: 'problem', message: CANT_REACH };
		}
	}

	onMount(load);
</script>

{#if screen.kind === 'sign-in'}
	<SignIn onsignin={() => auth?.signIn()} />
{:else if screen.kind === 'member'}
	<SignedIn firstName={screen.firstName} initial={screen.initial} onsignout={() => auth?.signOut()} />
{:else if screen.kind === 'refused'}
	<Refused email={screen.email} onanother={() => auth?.signOut()} />
{:else if screen.kind === 'problem'}
	<Problem message={screen.message} onretry={load} />
{:else if screen.kind === 'not-set-up'}
	<Problem message="Sign-in isn't set up in this version of the app yet." />
{/if}
