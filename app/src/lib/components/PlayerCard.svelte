<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Owner } from '#lib/household.ts';
	import { STREAK_SHOWN_FROM } from '#lib/word-game.ts';
	import Badge from './Badge.svelte';

	// A Member's card in "Who's playing?" (AB#68, AB#91): a link to start or carry on their game, or, once it's
	// finished, its result, which the game draws beside it without giving anything away.
	let {
		owner,
		status,
		streak,
		href,
		action,
		children
	}: {
		owner: Owner;
		status: string;
		/** Days in a row with a finished game, shown from STREAK_SHOWN_FROM. */
		streak: number;
		/** Where the card goes to play, or nothing for a game that's finished. */
		href?: string;
		/** What the button on a card to play says. */
		action?: string;
		/** A finished game's result. */
		children?: Snippet;
	} = $props();
</script>

{#snippet who()}
	<span class="who">
		<span class="name">{owner.name}</span>
		<span class="status">{status}</span>
		{#if streak >= STREAK_SHOWN_FROM}<span class="streak">{streak} days in a row</span>{/if}
	</span>
{/snippet}

{#if href}
	<a class="card" {href} style:background={owner.bg} style:color={owner.fg}>
		<Badge {owner} size={96} />
		{@render who()}
		<span class="action" style:background={owner.solid} style:color={owner.on}>{action}</span>
	</a>
{:else}
	<div class="card" style:background={owner.bg} style:color={owner.fg}>
		<Badge {owner} size={96} />
		{@render who()}
		{@render children?.()}
	</div>
{/if}

<style>
	.card {
		height: 100%;
		box-sizing: border-box;
		padding: 24px;
		border-radius: 24px;
		display: flex;
		align-items: center;
		gap: 24px;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.name {
		font-size: 44px;
		font-weight: 700;
		line-height: 1.1;
	}
	.status {
		font-size: 26px;
	}
	.streak {
		font-size: 22px;
	}
	.action {
		flex: none;
		height: 72px;
		padding: 0 32px;
		border-radius: 36px;
		font-size: 28px;
		font-weight: 700;
		display: flex;
		align-items: center;
	}
</style>
