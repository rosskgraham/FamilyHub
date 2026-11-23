<script lang="ts">
	// The layout of the screens with the logo in the middle: sign in (A), not this account (B), and problems.
	import type { Snippet } from 'svelte';
	import Logo from './Logo.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<main>
	<Logo />
	{@render children()}
</main>

<style>
	main {
		min-height: 100dvh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding: 32px;
		text-align: center;
	}

	main :global(h1) {
		margin: 8px 0 0;
		font-size: 30px;
		font-weight: 700;
	}

	main :global(p) {
		margin: 0;
		max-width: 300px;
		font-size: 17px;
		line-height: 1.45;
		color: var(--dim);
	}

	main :global(p.strong) {
		color: var(--ink);
		font-weight: 600;
	}

	main :global(p.small) {
		font-size: 14px;
	}

	main :global(.gap) {
		height: 18px;
	}
</style>
