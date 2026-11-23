<script lang="ts">
	// Signed in as one of the Household. A stand-in until the Shopping list arrives here (AB#57). The circle at the top
	// is who's signed in, one colour for everyone for now (Ross, 2026-11-23); tapping it offers Sign out.
	let {
		firstName,
		initial,
		onsignout,
		menuOpen = $bindable(false)
	}: { firstName: string; initial: string; onsignout: () => void; menuOpen?: boolean } = $props();
</script>

<div class="screen">
	<header>
		<h1>Shopping</h1>
		<button
			class="me"
			aria-label="Signed in as {firstName}"
			aria-expanded={menuOpen}
			onclick={() => (menuOpen = !menuOpen)}
		>
			{initial}
		</button>
		{#if menuOpen}
			<div class="menu" role="menu">
				<p>Signed in as {firstName}</p>
				<button class="button wide" role="menuitem" onclick={onsignout}>Sign out</button>
			</div>
		{/if}
	</header>
	<main>
		<p class="strong">Signed in as {firstName}</p>
		<p>The Shopping list comes here next.</p>
	</main>
</div>

<style>
	.screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	header {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 20px 10px;
	}

	h1 {
		margin: 0;
		font-size: 30px;
	}

	.me {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: none;
		background: #2456c9;
		color: #fff;
		font: 700 18px var(--font);
	}

	.menu {
		position: absolute;
		top: 70px;
		right: 16px;
		width: 240px;
		padding: 16px;
		border-radius: 18px;
		background: var(--card);
		border: 1px solid var(--line);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
		display: flex;
		flex-direction: column;
		gap: 12px;
		z-index: 1;
	}

	.menu p {
		margin: 0;
		font-size: 15px;
		color: var(--dim);
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 32px;
		text-align: center;
	}

	main p {
		margin: 0;
		font-size: 17px;
		color: var(--dim);
	}

	main p.strong {
		color: var(--ink);
		font-size: 22px;
		font-weight: 700;
	}
</style>
