<script lang="ts">
	let { size = 32 }: { size?: number } = $props();
</script>

<!-- A birthday cake with a lit candle, where a badge would be. -->
<svg class="cake" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Birthday">
	<title>Birthday</title>
	<path d="M12 1.2c1.2 1.4 1.7 2.4 1.7 3.2a1.7 1.7 0 0 1-3.4 0c0-.8.5-1.8 1.7-3.2Z" fill="var(--flame)" />
	<rect x="11" y="6.6" width="2" height="4.4" rx="1" fill="var(--cake)" />
	<path d="M4 13.2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.4c-1.3 0-1.3 1.2-2.7 1.2s-1.3-1.2-2.6-1.2-1.4 1.2-2.7 1.2-1.3-1.2-2.7-1.2-1.3 1.2-2.6 1.2S5.3 15.6 4 15.6Z" fill="var(--cake)" />
	<path d="M4 17.6c1.1.3 1.6-.6 2.6-.6s1.3 1.2 2.7 1.2 1.3-1.2 2.7-1.2 1.3 1.2 2.7 1.2 1.3-1.2 2.6-1.2 1.6.9 2.7.6V21H4Z" fill="var(--cake)" />
	<rect x="2" y="21" width="20" height="1.8" rx=".9" fill="var(--cake)" />
</svg>

<style>
	.cake {
		flex: none;
	}
</style>
