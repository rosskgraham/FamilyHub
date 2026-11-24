<script lang="ts">
	// Who's signed in: the circle at the top with their initial, one colour for everyone for now (Ross, 2026-11-23).
	// Tapping it opens a menu with Sign out (screen I); tapping it again, or anywhere else, closes it.
	let {
		firstName,
		initial,
		onsignout,
		unsent = 0,
		open = $bindable(false)
	}: { firstName: string; initial: string; onsignout: () => void; unsent?: number; open?: boolean } = $props();

	const warning = $derived(
		unsent === 1
			? "1 change hasn't sent yet. Signing out loses it."
			: `${unsent} changes haven't sent yet. Signing out loses them.`
	);
</script>

<button class="me" aria-label="Signed in as {firstName}" aria-expanded={open} onclick={() => (open = !open)}>
	{initial}
</button>
{#if open}
	<button class="away" aria-label="Close" tabindex="-1" onclick={() => (open = false)}></button>
	<div class="menu" role="menu">
		<p>Signed in as {firstName}</p>
		{#if unsent}
			<!-- Signing out clears the list from the phone, so these would be lost (AB#58). -->
			<p class="unsent">{warning}</p>
		{/if}
		<button class="button primary wide" role="menuitem" onclick={onsignout}>Sign out</button>
	</div>
{/if}

<style>
	.me {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: none;
		background: #2456c9;
		color: #fff;
		font: 700 18px var(--font);
		position: relative;
		z-index: 3;
	}

	.away {
		position: fixed;
		inset: 0;
		border: none;
		background: none;
		z-index: 2;
	}

	.menu {
		position: absolute;
		top: 70px;
		right: 16px;
		width: 240px;
		padding: 16px;
		box-sizing: border-box;
		border-radius: 18px;
		background: var(--card);
		border: 1px solid var(--line);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
		display: flex;
		flex-direction: column;
		gap: 12px;
		z-index: 3;
	}

	.menu p {
		margin: 0;
		font-size: 15px;
		color: var(--dim);
	}

	.menu p.unsent {
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		line-height: 1.35;
	}
</style>
