<script lang="ts">
	// Where the backend sends the browser back to after signing in, with a one-time code (ADR 0016). It's the app,
	// which swaps the code for a session as it opens (auth.ts).
	import App from '../../+page.svelte';
</script>

<App />
