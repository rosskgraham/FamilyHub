<script lang="ts">
	// When the app can't go on: the backend can't be reached, or sign-in isn't set up in this build.
	import Centred from './Centred.svelte';

	let { message, onretry }: { message: string; onretry?: () => void } = $props();
</script>

<Centred>
	<h1>FamilyHub</h1>
	<p class="strong">{message}</p>
	{#if onretry}
		<div class="gap"></div>
		<button class="button wide" onclick={onretry}>Try again</button>
	{/if}
</Centred>
