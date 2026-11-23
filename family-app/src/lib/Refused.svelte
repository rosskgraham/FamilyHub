<script lang="ts">
	// Screen B (design/mockups/family-app/phone-b.png): signed in with a Google account that isn't on the Household's
	// list. Nothing about the Household is shown.
	import Centred from './Centred.svelte';

	let { email, onanother }: { email: string; onanother: () => void } = $props();
</script>

<Centred>
	<h1>Not this account</h1>
	<p class="strong">{email} isn't one of the Household's accounts.</p>
	<p>If it should be, ask Ross to add it.</p>
	<div class="gap"></div>
	<button class="button wide" onclick={onanother}>Use another account</button>
</Centred>
