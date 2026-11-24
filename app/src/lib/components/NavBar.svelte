<script lang="ts">
	import { page } from '$app/state';
	import { showTime } from '#lib/show-time.svelte.ts';

	const links = [
		{ href: '/', label: 'Today' },
		{ href: '/day', label: 'Day' },
		{ href: '/week', label: 'Week' },
		{ href: '/shopping', label: 'Shopping' },
		{ href: '/todos', label: 'To-dos' },
		{ href: '/chores', label: 'Chores' },
		{ href: '/energy', label: 'Energy' },
		{ href: '/games', label: 'Games' }
	];

	// A view's own pages, such as a game in Games, keep its tab marked.
	const current = (href: string) =>
		page.url.pathname === href || (href !== '/' && page.url.pathname.startsWith(`${href}/`));

	const status = $derived(page.data.calendarStatus);
	const updated = (iso: string | null) => (iso ? `last updated ${showTime(iso)}` : 'not loaded yet');
</script>

<footer>
	<nav aria-label="Views">
		{#each links as link (link.href)}
			<a href={link.href} aria-current={current(link.href) ? 'page' : undefined}>{link.label}</a>
		{/each}
		<a
			class="settings"
			href="/settings"
			aria-label="Settings"
			aria-current={page.url.pathname === '/settings' ? 'page' : undefined}
		>
			<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
				<path
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
				/>
			</svg>
		</a>
	</nav>

	{#if status?.kind === 'sample'}
		<a class="status sample" href="/settings">{status.setUp ? 'Sample data' : 'Sample data · set up Google'}</a>
	{:else if status?.kind === 'live'}
		<span class="status">Updated {showTime(status.updatedAt)}</span>
	{:else if status?.kind === 'stale' && status.reason === 'sign-in'}
		<a class="status problem" href="/settings">Calendar needs signing in again</a>
	{:else if status?.kind === 'stale'}
		<span class="status problem">Offline · {updated(status.updatedAt)}</span>
	{/if}
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
	nav a {
		width: 132px;
		height: 64px;
		border-radius: 20px;
		font-size: 24px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	nav a.settings {
		width: 80px;
	}
	nav a[aria-current='page'] {
		background: var(--selected);
		font-weight: 700;
	}
	.status {
		height: 56px;
		padding: 0 22px;
		box-sizing: border-box;
		border-radius: 28px;
		display: flex;
		align-items: center;
		font-size: 22px;
		font-weight: 600;
		color: var(--dim);
	}
	.sample {
		border: 2px dashed var(--line);
	}
	.problem {
		background: var(--warn-bg);
		color: var(--warn-fg);
	}
</style>
