<script lang="ts">
	import type { BinColour } from '#lib/bins.ts';
	import type { Owner } from '#lib/household.ts';
	import Badge from './Badge.svelte';
	import BinIcon from './BinIcon.svelte';
	import CakeIcon from './CakeIcon.svelte';

	// An all-day Event: outlined in its owner's colour, with no time, so it
	// never looks like a timed Event, which is filled and leads with its time. A bin day shows its bin instead of a badge, and a birthday a cake.
	let {
		owner,
		title,
		height,
		badge = 26,
		fontSize = 20,
		bin,
		birthday = false
	}: {
		owner: Owner;
		title: string;
		height: number;
		badge?: number;
		fontSize?: number;
		bin?: BinColour;
		birthday?: boolean;
	} = $props();
</script>

<div
	class="banner"
	style:height="{height}px"
	style:border-color={owner.solid}
	style:color={owner.fg}
	style:font-size="{fontSize}px"
>
	{#if bin}<BinIcon colour={bin} size={badge} />{:else if birthday}<CakeIcon size={badge} />{:else}<Badge
			{owner}
			size={badge}
		/>{/if}
	<span class="title">{title}</span>
</div>

<style>
	.banner {
		flex: none;
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px 0 8px;
		border: 2px solid;
		border-radius: 12px;
		font-weight: 600;
	}
	.title {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
