<script lang="ts">
	import MealEditor from '#lib/components/MealEditor.svelte';
	import { byName, mealDetail, plannedFrom, type Meal } from '#lib/meals.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const COLUMNS = 3;
	// At least four rows, so a few meals don't stretch to fill the Section. More scroll.
	const MIN_ROWS = 4;

	const meals = $derived([...data.meals.meals].sort(byName));
	const rows = $derived(Math.max(MIN_ROWS, Math.ceil(meals.length / COLUMNS)));
	const status = $derived(data.meals.status);

	// The meal open in the editor: one of the saved meals, 'new', or nothing.
	let open: Meal | 'new' | null = $state(null);
</script>

<!-- The Meals Section (AB#98): the saved meals, A–Z. The week on the left comes with the plan (AB#99). -->
<section class="meals">
	<div class="head">
		<div class="title">
			<h2>Saved meals</h2>
			<span class="hint">{meals.length} meal{meals.length === 1 ? '' : 's'} · tap one to edit</span>
			{#if status.kind === 'stale'}
				<span class="chip problem">{status.waiting > 0 ? `Offline · ${status.waiting} to send` : 'Offline'}</span>
			{/if}
		</div>
		<button class="primary" onclick={() => (open = 'new')}>
			<svg
				width="26"
				height="26"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.6"
				stroke-linecap="round"
				aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
			>
			Add meal
		</button>
	</div>

	{#if meals.length === 0}
		<p class="empty">No saved meals yet. Add one to start planning dinners.</p>
	{:else}
		<ul style:grid-template-rows="repeat({rows}, minmax(84px, 1fr))">
			{#each meals as meal (meal.id)}
				<li>
					<button class="meal" onclick={() => (open = meal)}>
						<span class="name">{meal.name}</span>
						<span class="detail">{meal.saving ? 'Saving…' : mealDetail(meal.ingredients)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if open}
	<MealEditor
		meal={open === 'new' ? null : open}
		plannedFor={open === 'new' ? null : plannedFrom(data.meals.plan, open.id, data.today)}
		onclose={() => (open = null)}
	/>
{/if}

<style>
	.meals {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 28px;
		border-radius: 28px;
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.head {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: 16px;
	}
	h2 {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
	}
	.hint {
		font-size: 22px;
		color: var(--dim);
	}
	.chip {
		align-self: center;
		padding: 6px 16px;
		border-radius: 20px;
		font-size: 22px;
		font-weight: 600;
	}
	.chip.problem {
		background: var(--warn-bg);
		color: var(--warn-fg);
	}
	.primary {
		height: 64px;
		padding: 0 28px;
		border: 0;
		border-radius: 32px;
		background: var(--ink);
		color: var(--on-ink);
		font-size: 26px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	ul {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		overflow-y: auto;
	}
	li {
		min-width: 0;
		display: flex;
	}
	.meal {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 22px;
		border: 0;
		border-radius: 18px;
		background: var(--soft);
		color: var(--ink);
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		gap: 2px;
		text-align: left;
	}
	.name,
	.detail {
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name {
		font-size: 28px;
		font-weight: 700;
	}
	.detail {
		font-size: 20px;
		color: var(--dim);
	}
	.empty {
		flex: 1;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 28px;
		color: var(--dim);
	}
</style>
