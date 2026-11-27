<script lang="ts">
	// The FamilyHub logo (static/logo.svg) on its rounded tile. In the dark theme the tile is nearly the page's colour,
	// so it gets an edge (seen on Ross's phone, AB#55).
	let { size = 112 }: { size?: number } = $props();
</script>

<img src="/logo.svg" alt="" width={size} height={size} style:border-radius="{size / 4}px" />

<style>
	img {
		box-shadow: 0 0 0 2px var(--tile-edge);
		flex: none;
	}
</style>
