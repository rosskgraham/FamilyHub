<script lang="ts">
	// Shown in place of a page that couldn't load. The layout checks for changes every minute, which tries the page
	// again, and two minutes untouched takes the Hub back to the Today view, so the wall never sits on an error.
	import { page } from '$app/state';

	const missing = $derived(page.status === 404);
</script>

<section class="error">
	{#if missing}
		<h1>There’s no page here</h1>
		<p>The Hub will go back to Today in a couple of minutes.</p>
	{:else}
		<h1>This page couldn’t load</h1>
		<p>The Hub will try again in a minute.</p>
		<p class="detail">{page.error?.message}</p>
	{/if}
</section>

<style>
	.error {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		background: var(--card);
		border-radius: 28px;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: 56px;
		font-weight: 700;
	}
	p {
		margin: 0;
		font-size: 32px;
		color: var(--dim);
	}
	.detail {
		font-size: 24px;
		color: var(--problem);
	}
</style>
