<script lang="ts">
	import { dueBy, type Todo, type TodosStatus } from '#lib/todos.ts';
	import type { DayKey } from '#lib/time.ts';
	import ListChip from './ListChip.svelte';
	import TodoItem from './TodoItem.svelte';

	let {
		todos,
		status,
		today,
		rows
	}: { todos: Todo[]; status: TodosStatus; today: DayKey; /** How many rows fit. */ rows: number } = $props();

	let problem: string | null = $state(null);

	const due = $derived(dueBy(todos, today));
	const left = $derived(due.filter((t) => !t.tickedOff).length);
	// With more than fit, the last row says how many more there are.
	const visible = $derived(due.length > rows ? due.slice(0, rows - 1) : due);
	const more = $derived(due.length - visible.length);
</script>

<!-- The Today view's To-dos: what's due today or overdue. The rest are in the To-dos Section. -->
<section class="todos">
	<div class="head">
		<a href="/todos"><h2>To-dos</h2></a>
		<ListChip {status} label="{left} due" />
	</div>

	{#if problem}<p class="message" role="alert">{problem}</p>{/if}

	{#if due.length === 0}
		<p class="none">Nothing due today</p>
	{:else}
		<ul>
			{#each visible as todo (todo.id)}
				<li><TodoItem {todo} {today} showLate onproblem={(p) => (problem = p)} /></li>
			{/each}
			{#if more > 0}
				<li><a class="more" href="/todos">+{more} more</a></li>
			{/if}
		</ul>
	{/if}
</section>

<style>
	.todos {
		flex: 1;
		min-height: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 28px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		height: 44px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
	}
	.message {
		flex: none;
		margin: 0;
		padding: 10px 16px;
		border-radius: 14px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-size: 22px;
		font-weight: 600;
	}
	.none {
		margin: 0;
		font-size: 28px;
		color: var(--dim);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.more {
		height: 56px;
		border-radius: 16px;
		background: var(--soft);
		font-size: 24px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
