<script lang="ts">
	import { sendChange } from '#lib/quick-action.ts';
	import { MOST_INGREDIENTS, type Meal } from '#lib/meals.ts';
	import { formatDayMonth, formatWeekday } from '#lib/time.ts';

	let {
		meal,
		plannedFor,
		onclose
	}: {
		/** The meal being edited, or null for a new one. */
		meal: Meal | null;
		/** The first day from today it's planned for, if any, to say which goes empty if it's removed. */
		plannedFor: string | null;
		onclose: () => void;
	} = $props();

	const MAX_TEXT = 200;

	// svelte-ignore state_referenced_locally
	let name = $state(meal?.name ?? '');
	// svelte-ignore state_referenced_locally
	let ingredients: string[] = $state([...(meal?.ingredients ?? [])]);
	// The ingredient being typed into, if any.
	let editing: number | null = $state(null);
	let removing = $state(false);
	let problem: string | null = $state(null);
	let sending = $state(false);

	const kept = $derived(ingredients.map((i) => i.trim()).filter(Boolean));
	const full = $derived(ingredients.length >= MOST_INGREDIENTS);

	/** Stops typing into an ingredient, dropping it if it was left empty. */
	function finish() {
		if (editing !== null && !ingredients[editing]?.trim()) ingredients.splice(editing, 1);
		editing = null;
	}

	function edit(index: number) {
		if (editing === index) return;
		let target = index;
		// An empty one being typed into is dropped, and the ones after it move up.
		if (editing !== null && !ingredients[editing]?.trim()) {
			ingredients.splice(editing, 1);
			if (editing < index) target -= 1;
		}
		editing = target;
	}

	function addIngredient() {
		finish();
		if (full) return;
		ingredients.push('');
		editing = ingredients.length - 1;
	}

	function remove(index: number) {
		if (editing === index) editing = null;
		else if (editing !== null && editing > index) editing -= 1;
		ingredients.splice(index, 1);
	}

	// Return on the name starts the ingredients when there are none yet.
	function nameEntered(event: SubmitEvent) {
		event.preventDefault();
		if (ingredients.length === 0) addIngredient();
		else (document.activeElement as HTMLElement | null)?.blur();
	}

	// Return on the last ingredient opens a new one, so a list can be typed in one go.
	function ingredientEntered(event: SubmitEvent) {
		event.preventDefault();
		if (editing === null) return;
		const last = editing === ingredients.length - 1;
		if (!ingredients[editing]?.trim()) {
			finish();
			return;
		}
		if (last) addIngredient();
		else editing = null;
	}

	async function done() {
		finish();
		const trimmed = name.trim();
		if (!trimmed) return;
		sending = true;
		problem = await sendChange(
			'/api/meals',
			meal
				? { action: 'edit', id: meal.id, name: trimmed, ingredients: kept }
				: { action: 'add', name: trimmed, ingredients: kept }
		);
		sending = false;
		if (!problem) onclose();
	}

	async function removeMeal() {
		if (!meal) return;
		removing = false;
		problem = await sendChange('/api/meals', { action: 'remove', id: meal.id });
		if (!problem) onclose();
	}

	function focus(node: HTMLInputElement, on = true) {
		if (on) node.focus();
	}
</script>

<div class="backdrop" role="presentation">
	<div class="panel" role="dialog" aria-modal="true" aria-labelledby="meal-editor-title">
		<div class="top">
			<h2 id="meal-editor-title">{meal ? 'Edit meal' : 'New meal'}</h2>
			<div class="buttons">
				{#if meal}
					<button class="outline-danger" onclick={() => (removing = true)}>Remove meal</button>
				{/if}
				<button class="quiet" onclick={onclose}>Cancel</button>
				<button class="primary" disabled={!name.trim() || sending} onclick={done}>Done</button>
			</div>
		</div>

		{#if problem}<p class="message" role="alert">{problem}</p>{/if}

		<form class="name" onsubmit={nameEntered}>
			<label for="meal-name">Name</label>
			<input
				id="meal-name"
				bind:value={name}
				maxlength={MAX_TEXT}
				placeholder="What's it called?"
				onfocus={finish}
				use:focus={!meal}
			/>
			<!-- What the Hub's keyboard calls its Return key. -->
			<button type="submit" hidden>Next</button>
		</form>

		<div class="ingredients">
			<p class="label">
				Ingredients · {kept.length}{ingredients.length > 0 ? ' · tap one to rename it' : ''}
			</p>
			<ul>
				{#each ingredients as ingredient, i (i)}
					<li class:editing={editing === i}>
						{#if editing === i}
							<form onsubmit={ingredientEntered}>
								<input
									bind:value={ingredients[i]}
									maxlength={MAX_TEXT}
									aria-label="Ingredient {i + 1}"
									placeholder="Ingredient"
									use:focus
								/>
								<button type="submit" hidden>Next</button>
							</form>
						{:else}
							<button class="ingredient" onclick={() => edit(i)}>{ingredient}</button>
						{/if}
						<button class="remove" aria-label="Remove {ingredient || 'ingredient'}" onclick={() => remove(i)}>
							<svg
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.6"
								stroke-linecap="round"
								aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg
							>
						</button>
					</li>
				{/each}
				{#if !full}
					<li class="add-li">
						<button class="add" onclick={addIngredient}>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.6"
								stroke-linecap="round"
								aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
							>
							Add ingredient
						</button>
					</li>
				{/if}
			</ul>
		</div>

		{#if removing && meal}
			<div class="confirm" role="alertdialog" aria-labelledby="remove-title" aria-describedby="remove-why">
				<div class="ask">
					<p id="remove-title" class="big">Remove {meal.name}?</p>
					<p id="remove-why">
						{plannedFor
							? `It’s planned for ${formatWeekday(plannedFor, 'long')} ${formatDayMonth(plannedFor)}, which will be empty.`
							: 'It goes from the saved meals for everyone.'}
					</p>
					<div class="buttons">
						<button class="quiet" onclick={() => (removing = false)}>Keep</button>
						<button class="danger" onclick={removeMeal}>Remove meal</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 5;
		background: rgb(0 0 0 / 0.45);
	}
	/* Over the top of the Section, so the Hub's keyboard has the bottom of the screen. */
	.panel {
		position: absolute;
		top: 32px;
		left: 32px;
		right: 32px;
		max-height: 600px;
		box-sizing: border-box;
		padding: 32px;
		border-radius: 28px;
		background: var(--card);
		color: var(--ink);
		display: flex;
		flex-direction: column;
		gap: 22px;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
	}
	.top {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}
	h2 {
		margin: 0;
		font-size: 40px;
		font-weight: 700;
	}
	.buttons {
		display: flex;
		align-items: center;
		gap: 14px;
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

	.name {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	label,
	.label {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: var(--dim);
	}
	#meal-name {
		height: 72px;
		box-sizing: border-box;
		padding: 0 22px;
		border-radius: 16px;
		border: 2px solid var(--line);
		background: var(--soft);
		color: var(--ink);
		font: inherit;
		font-size: 32px;
		font-weight: 700;
	}
	#meal-name:focus {
		border-color: var(--ink);
		background: var(--card);
		outline: none;
	}

	.ingredients {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	ul {
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-auto-rows: 64px;
		gap: 12px;
		overflow-y: auto;
	}
	li {
		min-width: 0;
		box-sizing: border-box;
		padding: 0 8px 0 20px;
		border-radius: 16px;
		border: 3px solid transparent;
		background: var(--soft);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	li.editing {
		border-color: var(--ink);
		background: var(--card);
	}
	li.add-li {
		padding: 0;
		border: 0;
		background: none;
	}
	li form {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	li input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 26px;
		font-weight: 600;
		outline: none;
	}
	.ingredient {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 26px;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.remove {
		width: 48px;
		height: 48px;
		flex: none;
		border: 0;
		border-radius: 24px;
		background: transparent;
		color: var(--dim);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.add {
		flex: 1;
		height: 100%;
		box-sizing: border-box;
		padding: 0 20px;
		border-radius: 16px;
		border: 2px dashed var(--line);
		background: var(--card);
		color: var(--ink);
		font-size: 26px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.primary,
	.quiet,
	.danger,
	.outline-danger {
		height: 64px;
		padding: 0 28px;
		border-radius: 32px;
		font-size: 24px;
		font-weight: 700;
	}
	.primary {
		padding: 0 40px;
		border: 0;
		background: var(--ink);
		color: var(--on-ink);
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.quiet {
		border: 0;
		background: var(--soft);
		color: var(--ink);
	}
	.danger {
		border: 0;
		background: var(--danger);
		color: var(--on-danger);
	}
	.outline-danger {
		border: 2px solid var(--danger);
		background: var(--card);
		color: var(--danger);
	}

	.confirm {
		position: absolute;
		inset: 0;
		border-radius: 28px;
		background: rgb(0 0 0 / 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ask {
		width: 900px;
		box-sizing: border-box;
		padding: 40px 48px;
		border: 4px solid var(--ink);
		border-radius: 36px;
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 16px;
		font-size: 28px;
		color: var(--dim);
	}
	.ask p {
		margin: 0;
	}
	.ask .buttons {
		margin-top: 16px;
		justify-content: flex-end;
	}
	.big {
		font-size: 40px;
		font-weight: 700;
		color: var(--ink);
	}
</style>
