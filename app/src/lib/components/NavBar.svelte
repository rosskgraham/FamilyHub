<script lang="ts">
	import { page } from '$app/state';

	const links = [
		{ href: '/', label: 'Today' },
		{ href: '/week', label: 'Week' }
	];
</script>

<footer>
	<nav aria-label="Views">
		{#each links as link (link.href)}
			<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a>
		{/each}
	</nav>
	<span class="sample">Sample data</span>
</footer>

<style>
	footer {
		height: 96px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	nav {
		display: flex;
		padding: 6px;
		gap: 6px;
		border-radius: 26px;
		background: var(--segment);
	}
	a {
		width: 132px;
		height: 64px;
		border-radius: 20px;
		font-size: 24px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	a[aria-current='page'] {
		background: var(--card);
		font-weight: 700;
	}
	.sample {
		height: 56px;
		padding: 0 22px;
		border-radius: 28px;
		border: 2px dashed var(--line);
		display: flex;
		align-items: center;
		font-size: 22px;
		font-weight: 600;
		color: var(--dim);
	}
</style>
