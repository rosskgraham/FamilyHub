<script lang="ts">
	// When the app can't go on: the backend can't be reached, signing in didn't finish, or sign-in isn't set up in
	// this build.
	import Centred from './Centred.svelte';

	let { message, onretry, retry = 'Try again' }: { message: string; onretry?: () => void; retry?: string } = $props();
</script>

<Centred>
	<h1>FamilyHub</h1>
	<p class="strong">{message}</p>
	{#if onretry}
		<div class="gap"></div>
		<button class="button wide" onclick={onretry}>{retry}</button>
	{/if}
</Centred>
