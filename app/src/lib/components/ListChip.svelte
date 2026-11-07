<script lang="ts">
	import type { ListStatus } from '#lib/task-list.ts';

	let { status, label }: { status: ListStatus; /** What to say when all is well, such as "3 due". */ label: string } =
		$props();
</script>

<!-- Beside a Google Tasks list's heading: a count, or why it may be out of date. -->
{#if status.kind === 'stale' && status.reason === 'sign-in'}
	<a class="chip problem" href="/setup">Sign in needed</a>
{:else if status.kind === 'stale'}
	<span class="chip problem">{status.waiting > 0 ? `Offline · ${status.waiting} to send` : 'Offline'}</span>
{:else}
	<span class="chip">{label}</span>
{/if}

<style>
	.chip {
		flex: none;
		padding: 6px 16px;
		border-radius: 20px;
		background: var(--soft);
		font-size: 22px;
		font-weight: 600;
	}
	.problem {
		background: var(--warn-bg);
		color: var(--warn-fg);
	}
</style>
