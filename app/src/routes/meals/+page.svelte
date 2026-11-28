<script lang="ts">
	import MealEditor from '#lib/components/MealEditor.svelte';
	import MealPicker from '#lib/components/MealPicker.svelte';
	import { byName, dinnerOn, mealDetail, plannedFrom, weekFrom, type Meal } from '#lib/meals.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Two beside the week (AB#99).
	const COLUMNS = 2;
	// At least four rows, so a few meals don't stretch to fill the Section. More scroll.
	const MIN_ROWS = 4;

	const meals = $derived([...data.meals.meals].sort(byName));
	const rows = $derived(Math.max(MIN_ROWS, Math.ceil(meals.length / COLUMNS)));
	const status = $derived(data.meals.status);

	// Today and the next 6 days, from the Hub's own date, which the screen reloads every minute, so the week moves on at
	// midnight without a reload.
	const week = $derived(weekFrom(data.today));

	// The meal open in the editor: one of the saved meals, 'new', or nothing. A new meal from the picker is planned for
	// the picker's day as it's saved.
	let open: Meal | 'new' | null = $state(null);
	let planFor: string | undefined = $state(undefined);
	// The day whose picker is open.
	let picking: string | null = $state(null);

	function editMeal(meal: Meal | 'new', forDay?: string) {
		planFor = forDay;
		open = meal;
	}
</script>

<section class="week" aria-labelledby="week-title">
	<div class="head">
		<h2 id="week-title">This week</h2>
		<span class="hint">Tap a day to plan it</span>
	</div>
	<ol>
		{#each week as day, i (day.date)}
			{@const dinner = dinnerOn(day.date, data.meals.plan, data.meals.meals)}
			<li>
				<button class="day" class:today={i === 0} class:empty={!dinner} onclick={() => (picking = day.date)}>
					<span class="when">
						<span class="label">{day.label}</span>
						<span class="date">{day.detail}</span>
					</span>
					<span class="dinner">{dinner?.name ?? 'Nothing planned'}</span>
				</button>
			</li>
		{/each}
	</ol>
</section>

<!-- The Meals Section: this week's dinners (AB#99), and the saved meals, A–Z (AB#98). -->
<section class="meals" aria-labelledby="meals-title">
	<div class="head">
		<div class="title">
			<h2 id="meals-title">Saved meals</h2>
			<span class="hint">{meals.length} meal{meals.length === 1 ? '' : 's'} · tap one to edit</span>
			{#if status.kind === 'stale'}
				<span class="chip problem">{status.waiting > 0 ? `Offline · ${status.waiting} to send` : 'Offline'}</span>
			{/if}
		</div>
		<button class="primary" onclick={() => editMeal('new')}>
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
					<button class="meal" onclick={() => editMeal(meal)}>
						<span class="name">{meal.name}</span>
						<span class="detail">{meal.saving ? 'Saving…' : mealDetail(meal.ingredients)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if picking}
	<MealPicker
		date={picking}
		meals={data.meals.meals}
		planned={dinnerOn(picking, data.meals.plan, data.meals.meals)}
		onnew={() => {
			const day = picking!;
			picking = null;
			editMeal('new', day);
		}}
		onclose={() => (picking = null)}
	/>
{/if}

{#if open}
	<MealEditor
		meal={open === 'new' ? null : open}
		plannedFor={open === 'new' ? null : plannedFrom(data.meals.plan, open.id, data.today)}
		{planFor}
		onclose={() => (open = null)}
	/>
{/if}

<style>
	.week {
		width: 700px;
		flex: none;
		box-sizing: border-box;
		padding: 28px;
		border-radius: 28px;
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.week .head {
		align-items: baseline;
	}
	ol {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	ol li {
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.day {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 22px;
		border-radius: 18px;
		border: 3px solid transparent;
		background: var(--soft);
		color: var(--ink);
		display: flex;
		align-items: center;
		gap: 20px;
		text-align: left;
	}
	.day.empty {
		border: 2px dashed var(--line);
		background: var(--card);
	}
	.day.today {
		border: 3px solid var(--ink);
		background: var(--card);
	}
	.when {
		width: 150px;
		flex: none;
		display: flex;
		flex-direction: column;
	}
	.label {
		font-size: 26px;
		font-weight: 700;
	}
	.date {
		font-size: 20px;
		color: var(--dim);
	}
	.dinner {
		flex: 1;
		min-width: 0;
		font-size: 30px;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.empty .dinner {
		font-weight: 500;
		color: var(--dim);
	}

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
		grid-template-columns: repeat(2, minmax(0, 1fr));
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
