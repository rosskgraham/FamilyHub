<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { CalendarStatus } from '#lib/calendar.ts';
	import { formatTime } from '#lib/time.ts';

	const links = [
		{ href: '/', label: 'Today' },
		{ href: '/day', label: 'Day' },
		{ href: '/week', label: 'Week' },
		{ href: '/shopping', label: 'Shopping' },
		{ href: '/chores', label: 'Chores' },
		{ href: '/energy', label: 'Energy' }
	];

	const status = $derived(page.data.calendarStatus as CalendarStatus | undefined);
	const updated = (iso: string | null) => (iso ? `last updated ${formatTime(new Date(iso))}` : 'not loaded yet');

	// A long press on the status opens setup. It's hidden like this because setup can sign the Hub out of Google.
	const LONG_PRESS_MS = 1000;
	function opensSetup(node: HTMLElement) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const start = () => {
			clearTimeout(timer);
			timer = setTimeout(() => goto('/setup'), LONG_PRESS_MS);
		};
		const end = () => clearTimeout(timer);
		const menu = (e: Event) => e.preventDefault();
		const events = { pointerdown: start, pointerup: end, pointerleave: end, pointercancel: end, contextmenu: menu };
		for (const [name, handler] of Object.entries(events)) node.addEventListener(name, handler);
		return {
			destroy() {
				end();
				for (const [name, handler] of Object.entries(events)) node.removeEventListener(name, handler);
			}
		};
	}
</script>

<footer>
	<nav aria-label="Views">
		{#each links as link (link.href)}
			<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a>
		{/each}
	</nav>

	{#if status?.kind === 'sample'}
		<a class="status sample" href="/setup" use:opensSetup
			>{status.setUp ? 'Sample data' : 'Sample data · set up Google'}</a
		>
	{:else if status?.kind === 'live'}
		<span class="status" use:opensSetup>Updated {formatTime(new Date(status.updatedAt))}</span>
	{:else if status?.kind === 'stale' && status.reason === 'sign-in'}
		<a class="status problem" href="/setup" use:opensSetup>Calendar needs signing in again</a>
	{:else if status?.kind === 'stale'}
		<span class="status problem" use:opensSetup>Offline · {updated(status.updatedAt)}</span>
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
