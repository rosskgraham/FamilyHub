<script lang="ts">
	import { sendChange } from '#lib/quick-action.ts';
	import { lateness, type Todo } from '#lib/todos.ts';
	import type { DayKey } from '#lib/time.ts';

	let {
		todo,
		today,
		showLate = false,
		onproblem
	}: {
		todo: Todo;
		today: DayKey;
		/** Say how late an overdue To-do is, such as "3 days late". */
		showLate?: boolean;
		/** What to tell the Household when a tick didn't reach Google. */
		onproblem: (problem: string | null) => void;
	} = $props();

	// The tick shows straight away, and is undone if Google turns it down.
	let ticking: boolean | null = $state(null);
	const tickedOff = $derived(ticking ?? todo.tickedOff);
	const late = $derived(showLate && !tickedOff && todo.due !== null && todo.due < today);

	async function toggle() {
		ticking = !tickedOff;
		onproblem(await sendChange('/api/todos', { action: 'tick', id: todo.id, tickedOff: ticking }));
		ticking = null;
	}
</script>

<button
	class="todo"
	class:ticked={tickedOff}
	aria-pressed={tickedOff}
	aria-label="{tickedOff ? 'Untick' : 'Tick off'} {todo.text}"
	onclick={toggle}
>
	<span class="mark">
		{#if tickedOff}
			<svg
				width="26"
				height="26"
				viewBox="0 0 24 24"
				fill="none"
				style="stroke: var(--on-ink)"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
			>
		{/if}
	</span>
	<span class="text">{todo.text}</span>
	{#if late}<span class="late">{lateness(todo.due!, today)}</span>{/if}
</button>

<style>
	.todo {
		width: 100%;
		min-width: 0;
		height: 64px;
		padding: 0;
		border: 0;
		background: none;
		display: flex;
		align-items: center;
		gap: 16px;
		text-align: left;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
	}
	/* A 64px touch target around a 44px box, as on the Shopping list. */
	.mark {
		width: 44px;
		height: 44px;
		margin: 0 10px;
		flex: none;
		box-sizing: border-box;
		border-radius: 12px;
		border: 3px solid var(--box);
		background: var(--card);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ticked .mark {
		background: var(--ink);
	}
	.text {
		flex: 1;
		min-width: 0;
		font-size: 30px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ticked .text {
		color: var(--dim);
		text-decoration: line-through;
	}
	.late {
		flex: none;
		padding: 6px 14px;
		border-radius: 16px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-size: 22px;
		font-weight: 700;
	}
</style>
