<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { chime } from '#lib/chime.ts';
	import type { Owner } from '#lib/household.ts';
	import Badge from './Badge.svelte';
	import Star from './Star.svelte';

	let {
		owner,
		title,
		stars,
		cheer = true,
		close = 'Nice one!',
		onclose,
		children
	}: {
		owner: Owner;
		title: string;
		/** Stars earned, for finishing a Routine. */
		stars?: number;
		/** The chime and the burst of stars. Without them it's a quieter ending, such as a word not found. */
		cheer?: boolean;
		/** The button that closes it. */
		close?: string;
		onclose: () => void;
		children?: Snippet;
	} = $props();

	// It closes by itself, so the next child isn't kept waiting.
	const SHOW_MS = 6000;
	const BURST = 12;

	onMount(() => {
		if (cheer) chime();
		const timer = setTimeout(onclose, SHOW_MS);
		return () => clearTimeout(timer);
	});
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
	<div class="card" role="alertdialog" aria-labelledby="celebration-title">
		<div class="burst" aria-hidden="true">
			{#if cheer}
				{#each { length: BURST } as _, i (i)}
					<span class="spark" style:--angle="{(360 / BURST) * i}deg"><Star size={44} /></span>
				{/each}
			{/if}
			<Badge {owner} size={140} />
		</div>
		<h2 id="celebration-title">{title}</h2>
		{#if stars !== undefined}
			<p class="earned tabular"><Star size={48} />+{stars} {stars === 1 ? 'Star' : 'Stars'}</p>
		{/if}
		{@render children?.()}
		<button class="close" style:background={owner.solid} style:color={owner.on} onclick={onclose}>{close}</button>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgb(22 27 34 / 0.55);
	}
	.card {
		width: 960px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 56px 64px;
		border-radius: 40px;
		background: var(--card);
		text-align: center;
		animation: pop 400ms cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	.burst {
		position: relative;
		width: 360px;
		height: 320px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.spark {
		position: absolute;
		top: 50%;
		left: 50%;
		margin: -22px 0 0 -22px;
		transform: rotate(var(--angle)) translateY(-140px) rotate(calc(-1 * var(--angle)));
		animation: fly 900ms ease-out;
	}
	h2 {
		margin: 0;
		font-size: 64px;
		font-weight: 700;
		line-height: 1.1;
	}
	.earned {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 44px;
		font-weight: 700;
	}
	.close {
		height: 88px;
		padding: 0 56px;
		border: 0;
		border-radius: 44px;
		font-size: 36px;
		font-weight: 700;
	}
	@keyframes pop {
		from {
			transform: scale(0.6);
			opacity: 0;
		}
	}
	@keyframes fly {
		from {
			transform: rotate(var(--angle)) translateY(0) rotate(calc(-1 * var(--angle))) scale(0.2);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card,
		.spark {
			animation: none;
		}
	}
</style>
