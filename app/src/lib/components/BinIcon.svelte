<script lang="ts">
	import type { BinColour } from '#lib/bins.ts';

	let { colour, size = 32 }: { colour: BinColour; size?: number } = $props();
</script>

<!-- A wheelie bin in the bin's colour, where a badge would be. -->
<svg
	class="bin"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	style:color="var(--bin-{colour})"
	role="img"
	aria-label="{colour} bin"
>
	<title>{colour[0]!.toUpperCase()}{colour.slice(1)} bin</title>
	<rect x="9" y="1.5" width="6" height="2" rx="1" fill="currentColor" />
	<rect x="2.5" y="4" width="19" height="3.2" rx="1.2" fill="currentColor" />
	<path d="M4.6 8.4h14.8l-1.6 11.6a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3Z" fill="currentColor" />
	<circle cx="7.5" cy="21.6" r="1.6" fill="currentColor" />
	<circle cx="16.5" cy="21.6" r="1.6" fill="currentColor" />
</svg>

<style>
	.bin {
		flex: none;
	}
</style>
