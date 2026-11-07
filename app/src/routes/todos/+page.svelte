<script lang="ts">
	import ListChip from '#lib/components/ListChip.svelte';
	import TodoItem from '#lib/components/TodoItem.svelte';
	import { sendChange } from '#lib/quick-action.ts';
	import { groupTodos } from '#lib/todos.ts';
	import { addDays, type DayKey } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const groups = $derived(groupTodos(data.todos.items, data.today));
	const left = $derived(data.todos.items.filter((t) => !t.tickedOff).length);

	let problem: string | null = $state(null);
	let adding = $state(false);
	let draft = $state('');
	let due: DayKey | null = $state(null);

	// The quick choices; any other date comes from the date picker.
	const choices = $derived([
		{ label: 'No date', due: null },
		{ label: 'Today', due: data.today },
		{ label: 'Tomorrow', due: addDays(data.today, 1) }
	]);

	function close() {
		adding = false;
		draft = '';
		due = null;
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		const change = { action: 'add', text, due };
		close();
		problem = await sendChange('/api/todos', change);
		// Put it back, so it can be sent again.
		if (problem) {
			adding = true;
			draft = text;
			due = change.due;
		}
	}

	function focus(node: HTMLInputElement) {
		node.focus();
	}
</script>

<!-- The To-dos Section: everything still to do, by when it's due. Repeating To-dos show once Google lists them. -->
<section class="todos">
	<div class="head">
		<h2>To-dos</h2>
		<ListChip status={data.todos.status} label="{left} to do" />
		{#if !adding}
			<button class="quiet add-button" onclick={() => (adding = true)}>
				<svg
					width="26"
					height="26"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.6"
					stroke-linecap="round"
					aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
				>
				Add to-do
			</button>
		{/if}
	</div>

	{#if adding}
		<!-- Only one-off To-dos are added here. Repeating ones are set up in the Google Tasks app. -->
		<form class="add" onsubmit={add}>
			<input bind:value={draft} placeholder="What needs doing?" maxlength="200" aria-label="New to-do" use:focus />
			<div class="due" role="group" aria-label="Due">
				{#each choices as choice (choice.label)}
					<button type="button" class="choice" aria-pressed={due === choice.due} onclick={() => (due = choice.due)}
						>{choice.label}</button
					>
				{/each}
				<input
					class="choice date"
					type="date"
					aria-label="Due on"
					class:chosen={due !== null && !choices.some((c) => c.due === due)}
					min={data.today}
					value={due ?? ''}
					onchange={(e) => (due = e.currentTarget.value || null)}
				/>
			</div>
			<button class="primary" type="submit" disabled={!draft.trim()}>Add</button>
			<button class="quiet" type="button" onclick={close}>Cancel</button>
		</form>
	{/if}

	{#if problem}<p class="message" role="alert">{problem}</p>{/if}

	{#if groups.length === 0}
		<p class="none">Nothing to do</p>
	{:else}
		<div class="groups">
			{#each groups as group (group.title)}
				<div class="group">
					<h3>{group.title}</h3>
					<ul>
						{#each group.todos as todo (todo.id)}
							<li>
								<TodoItem
									{todo}
									today={data.today}
									showLate={group.title === 'Overdue'}
									onproblem={(p) => (problem = p)}
								/>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.todos {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 28px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		height: 72px;
		flex: none;
		display: flex;
		align-items: center;
		gap: 20px;
	}
	h2 {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
	}
	.add-button {
		margin-left: auto;
	}
	.add {
		flex: none;
		height: 72px;
		display: flex;
		gap: 12px;
	}
	input {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 20px;
		border-radius: 22px;
		border: 2px solid var(--line);
		background: var(--card);
		color: inherit;
		font: inherit;
		font-size: 26px;
	}
	.due {
		flex: none;
		display: flex;
		gap: 6px;
		padding: 4px;
		border-radius: 24px;
		background: var(--segment);
	}
	.choice {
		height: 64px;
		padding: 0 20px;
		box-sizing: border-box;
		border: 0;
		border-radius: 20px;
		background: none;
		font-size: 24px;
		font-weight: 600;
	}
	.choice[aria-pressed='true'],
	.date.chosen {
		background: var(--selected);
		font-weight: 700;
	}
	.date {
		flex: none;
		width: 220px;
	}
	.primary,
	.quiet {
		flex: none;
		height: 72px;
		padding: 0 28px;
		box-sizing: border-box;
		border-radius: 22px;
		font-size: 26px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.primary {
		border: 0;
		background: var(--ink);
		color: var(--on-ink);
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.quiet {
		border: 2px solid var(--line);
		background: var(--card);
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
	/* Three columns, filled down then across, scrolling if there are ever more To-dos than fit. */
	.groups {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		column-count: 3;
		column-gap: 40px;
	}
	.group {
		break-inside: avoid;
		margin-bottom: 24px;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 26px;
		font-weight: 700;
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
</style>
