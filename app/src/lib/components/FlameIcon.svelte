<script lang="ts">
	// Filled while the Nest is calling for heat, an outline otherwise. From the heating mockups.
	let { filled, size = 56 }: { filled: boolean; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
	<path
		d="M12 2c.6 3.3-1 5.2-2.6 7.1C8 10.8 6.5 12.6 6.5 15.2A5.5 5.5 0 0 0 12 21a5.5 5.5 0 0 0 5.5-5.8c-.1-2.4-1.3-4-2.4-5.3-.2 1.4-.8 2.5-1.9 3.1.5-3.5-.4-7.4-1.2-11z"
		fill={filled ? 'currentColor' : 'none'}
		stroke={filled ? 'none' : 'currentColor'}
		stroke-width="1.8"
		stroke-linejoin="round"
	/>
</svg>

<style>
	svg {
		flex: none;
	}
</style>
