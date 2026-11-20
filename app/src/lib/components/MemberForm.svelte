<script lang="ts">
	import { enhance } from '$app/forms';
	import { colours, type Colour } from '#lib/household.ts';
	import Badge from './Badge.svelte';

	// One row of the Household in Settings: a Member, the Family calendar, or someone new. Saved with its own button,
	// so nothing changes by accident while choosing.

	interface CalendarChoice {
		id: string;
		summary: string;
	}

	let {
		action,
		id = '',
		name = '',
		colour,
		calendar = '',
		calendars,
		fixedName,
		unavailable = [],
		submit = 'Save',
		removable = false,
		message = null
	}: {
		action: string;
		id?: string;
		name?: string;
		colour: Colour | null;
		calendar?: string;
		/** The Calendars to choose from, or null when Google can't be asked. */
		calendars: CalendarChoice[] | null;
		/** The Family calendar's row has a name that can't be changed. */
		fixedName?: string;
		/** Colours someone else has that this row can't take. */
		unavailable?: Colour[];
		submit?: string;
		removable?: boolean;
		message?: string | null;
	} = $props();

	// The colour being chosen, shown on the badge before it's saved.
	let chosen = $state<Colour | null>(null);
	let typed = $state<string | null>(null);
	const shownColour = $derived(chosen ?? colour);
	const shownName = $derived(fixedName ?? (typed ?? name).trim());
	const preview = $derived(
		shownColour
			? {
					id: id || 'new',
					name: shownName || '?',
					initial: fixedName ? 'All' : (shownName.charAt(0) || '?').toUpperCase(),
					...colours[shownColour]
				}
			: null
	);

	// Removing takes a second tap, in case the first was a slip.
	let confirming = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;
	function remove(e: MouseEvent) {
		if (confirming) return;
		e.preventDefault();
		confirming = true;
		clearTimeout(confirmTimer);
		confirmTimer = setTimeout(() => (confirming = false), 4000);
	}

	const isNew = $derived(action === '?/addMember');
	const label = $derived(fixedName ?? (name || 'New Member'));
</script>

<form
	method="POST"
	{action}
	class="member"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: isNew && result.type === 'success' });
			if (result.type === 'success') {
				chosen = null;
				typed = null;
			}
			confirming = false;
		}}
>
	{#if id}<input type="hidden" name="id" value={id} />{/if}
	<span class="badge">
		{#if preview}<Badge owner={preview} size={56} />{:else}<span class="empty-badge"></span>{/if}
	</span>
	{#if fixedName}
		<span class="fixed">{fixedName}</span>
	{:else}
		<input
			name="name"
			value={name}
			maxlength="30"
			placeholder="Name"
			aria-label="{label}’s name"
			oninput={(e) => (typed = e.currentTarget.value)}
		/>
	{/if}
	<div class="swatches" role="radiogroup" aria-label="{label}’s colour">
		{#each Object.keys(colours) as c (c)}
			{@const taken = unavailable.includes(c as Colour)}
			<label class="swatch" class:taken style:--swatch="var(--{c}-solid)" title={c}>
				<input
					type="radio"
					name="colour"
					value={c}
					checked={shownColour === c}
					disabled={taken}
					aria-label={c}
					onchange={() => (chosen = c as Colour)}
				/>
			</label>
		{/each}
	</div>
	{#if calendars}
		<select name="calendar" value={calendar} aria-label="{label}’s Calendar">
			<option value="">No Calendar</option>
			{#each calendars as c (c.id)}
				<option value={c.id}>{c.summary}</option>
			{/each}
		</select>
	{/if}
	<button class="primary" type="submit">{submit}</button>
	{#if removable}
		<button class="quiet" class:confirming type="submit" formaction="?/removeMember" onclick={remove}
			>{confirming ? 'Tap to remove' : 'Remove'}</button
		>
	{/if}
</form>
{#if message}<p class="problem" role="alert">{message}</p>{/if}

<style>
	.member {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.badge {
		flex: none;
		width: 56px;
		display: flex;
	}
	.empty-badge {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		border: 2px dashed var(--line);
	}
	input[name='name'],
	.fixed {
		width: 260px;
		flex: none;
		box-sizing: border-box;
		font-size: 26px;
		font-weight: 600;
	}
	input[name='name'] {
		height: 64px;
		padding: 0 16px;
		border-radius: 16px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--ink);
		font-family: inherit;
	}
	.fixed {
		padding: 0 18px;
	}
	.swatches {
		display: flex;
		gap: 6px;
	}
	.swatch {
		position: relative;
		width: 44px;
		height: 44px;
		box-sizing: border-box;
		border-radius: 50%;
		background: var(--swatch);
		border: 4px solid transparent;
		outline: 3px solid transparent;
		outline-offset: 1px;
		cursor: pointer;
	}
	.swatch:has(input:checked) {
		border-color: var(--card);
		outline-color: var(--ink);
	}
	.swatch.taken {
		opacity: 0.25;
		cursor: default;
	}
	/* Invisible, but covering the whole circle, so a tap anywhere on it chooses it. */
	.swatch input {
		position: absolute;
		inset: -4px;
		margin: 0;
		opacity: 0;
		cursor: inherit;
	}
	select {
		flex: 1;
		min-width: 0;
		height: 64px;
		padding: 0 14px;
		border-radius: 16px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		font-size: 22px;
	}
	.primary,
	.quiet {
		flex: none;
		height: 64px;
		padding: 0 24px;
		box-sizing: border-box;
		border-radius: 20px;
		font-size: 24px;
		font-weight: 700;
	}
	.primary {
		border: 0;
		background: var(--ink);
		color: var(--on-ink);
	}
	.quiet {
		border: 2px solid var(--line);
		background: var(--card);
	}
	.quiet.confirming {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--on-danger);
	}
	.problem {
		margin: 8px 0 0 72px;
		padding: 10px 18px;
		border-radius: 14px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-size: 22px;
		font-weight: 600;
	}
</style>
