<script lang="ts">
	// Where MSAL's hidden renewal frame lands after the FamilyHub tenant answers. It passes the answer back to the app
	// and shows nothing (MSAL v5's redirect bridge). It's a redirect URI on FamilyHub app (the sign-in runbook).
	import { onMount } from 'svelte';
	import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

	onMount(() => {
		broadcastResponseToMainFrame().catch(() => {
			// Opened directly, with no answer to pass on: nothing to do.
		});
	});
</script>
