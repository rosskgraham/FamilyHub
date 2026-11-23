<script lang="ts">
	// Screen A (design/mockups/family-app/phone-a.png): nobody's signed in.
	import Centred from './Centred.svelte';

	let { onsignin }: { onsignin: () => void } = $props();
</script>

<Centred>
	<h1>FamilyHub</h1>
	<p>The family's Shopping list, on your phone.</p>
	<div class="gap"></div>
	<button class="button primary wide" onclick={onsignin}>
		<span class="g" aria-hidden="true">G</span>Sign in with Google
	</button>
	<p class="small">Use your own Google account.</p>
</Centred>

<style>
	.g {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #fff;
		color: #2456c9;
		display: grid;
		place-items: center;
		font-size: 15px;
		font-weight: 700;
	}
</style>
