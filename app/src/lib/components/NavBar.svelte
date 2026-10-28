<script lang="ts">
	import { page } from '$app/state';
	import type { CalendarStatus } from '#lib/calendar.ts';
	import { formatTime } from '#lib/time.ts';

	const links = [
		{ href: '/', label: 'Today' },
		{ href: '/day', label: 'Day' },
		{ href: '/week', label: 'Week' },
		{ href: '/shopping', label: 'Shopping' }
	];

	const status = $derived(page.data.calendarStatus as CalendarStatus | undefined);
	const updated = (iso: string | null) => (iso ? `last updated ${formatTime(new Date(iso))}` : 'not loaded yet');
</script>

<footer>
	<nav aria-label="Views">
		{#each links as link (link.href)}
			<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a>
		{/each}
	</nav>

	{#if status?.kind === 'sample'}
		<a class="status sample" href="/setup">{status.setUp ? 'Sample data' : 'Sample data · set up Google'}</a>
	{:else if status?.kind === 'live'}
		<span class="status">Updated {formatTime(new Date(status.updatedAt))}</span>
	{:else if status?.kind === 'stale' && status.reason === 'sign-in'}
		<a class="status problem" href="/setup">Calendar needs signing in again</a>
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
	nav a[aria-current='page'] {
		background: var(--card);
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
		background: #ffddb8;
		color: #6b2e00;
	}
</style>
