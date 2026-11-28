<script lang="ts">
	import { sendChange } from '#lib/quick-action.ts';
	import { byName, type Meal } from '#lib/meals.ts';
	import { formatDayMonth, formatWeekday } from '#lib/time.ts';

	let {
		date,
		meals,
		planned,
		onnew,
		onclose
	}: {
		/** The day being planned. */
		date: string;
		meals: Meal[];
		/** The meal planned for it now, if any. */
		planned: Meal | null;
		/** New meal: opens the editor, which plans it for this day when it's saved. */
		onnew: () => void;
		onclose: () => void;
	} = $props();

	const sorted = $derived([...meals].sort(byName));
	const weekday = $derived(formatWeekday(date, 'long'));
	let problem: string | null = $state(null);

	async function send(change: object) {
		problem = await sendChange('/api/meals', change);
		if (!problem) onclose();
	}

	function pick(meal: Meal) {
		// Picking what's planned already changes nothing.
		if (meal.id === planned?.id) onclose();
		else send({ action: 'plan', date, mealId: meal.id });
	}
</script>

<div class="backdrop" role="presentation">
	<div class="panel" role="dialog" aria-modal="true" aria-labelledby="picker-title">
		<div class="top">
			<div>
				<p class="day">{weekday} {formatDayMonth(date)}</p>
				<h2 id="picker-title">What’s for dinner?</h2>
			</div>
			<div class="buttons">
				<button class="clear" onclick={() => send({ action: 'unplan', date })}>Nothing planned</button>
				<button class="quiet" onclick={onclose}>Cancel</button>
			</div>
		</div>

		{#if problem}<p class="message" role="alert">{problem}</p>{/if}

		<ul>
			{#each sorted as meal (meal.id)}
				{@const current = meal.id === planned?.id}
				<li>
					<button class="meal" class:current aria-pressed={current} onclick={() => pick(meal)}>
						<span class="text">
							<span class="name">{meal.name}</span>
							<span class="detail">
								{meal.ingredients.length === 0
									? 'No ingredients'
									: `${meal.ingredients.length} ingredient${meal.ingredients.length === 1 ? '' : 's'}`}
							</span>
						</span>
						{#if current}
							<span class="badge">
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"><path d="M5 12l5 5L19 7" /></svg
								>
								Planned
							</span>
						{/if}
					</button>
				</li>
			{/each}
			<li>
				<button class="new" onclick={onnew}>
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.6"
						stroke-linecap="round"
						aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
					>
					New meal
				</button>
			</li>
		</ul>

		<p class="hint">Tap a meal to plan it for {weekday}. More meals scroll.</p>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 5;
		background: rgb(0 0 0 / 0.45);
	}
	.panel {
		position: absolute;
		inset: 32px;
		box-sizing: border-box;
		padding: 36px;
		border-radius: 28px;
		background: var(--card);
		color: var(--ink);
		display: flex;
		flex-direction: column;
		gap: 28px;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
	}
	.top {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}
	.day {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
	}
	h2 {
		margin: 0;
		font-size: 48px;
		font-weight: 700;
		line-height: 1.15;
	}
	.buttons {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.clear,
	.quiet {
		height: 64px;
		padding: 0 28px;
		border-radius: 32px;
		font-size: 24px;
		font-weight: 700;
		color: var(--ink);
	}
	.clear {
		border: 2px dashed var(--box);
		background: var(--card);
	}
	.quiet {
		border: 0;
		background: var(--soft);
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

	ul {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-auto-rows: minmax(116px, 1fr);
		gap: 16px;
		overflow-y: auto;
	}
	li {
		min-width: 0;
		display: flex;
	}
	.meal,
	.new {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 24px;
		border-radius: 20px;
		display: flex;
		align-items: center;
		gap: 16px;
		text-align: left;
	}
	.meal {
		border: 3px solid transparent;
		background: var(--soft);
		color: var(--ink);
	}
	.meal.current {
		border-color: var(--ink);
		background: var(--card);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.name {
		font-size: 32px;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.detail {
		font-size: 22px;
		color: var(--dim);
	}
	.badge {
		flex: none;
		height: 40px;
		padding: 0 14px;
		border-radius: 20px;
		background: var(--ink);
		color: var(--on-ink);
		font-size: 20px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.new {
		border: 2px dashed var(--line);
		background: var(--card);
		color: var(--ink);
		font-size: 30px;
		font-weight: 700;
		gap: 12px;
	}
	.hint {
		flex: none;
		margin: 0;
		font-size: 22px;
		color: var(--dim);
	}
</style>
