<script lang="ts">
	// The FamilyHub logo on its dark tile. In the dark theme the tile is nearly the page's colour, so it gets an edge
	// (seen on Ross's phone, AB#55).
	let { size = 112 }: { size?: number } = $props();
</script>

<div class="tile" style:width="{size}px" style:height="{size}px" style:border-radius="{size / 4}px">
	<svg viewBox="0 0 120 120" width={size * 0.75} height={size * 0.75} aria-hidden="true">
		<path
			d="M24 58 L60 27 L96 58"
			fill="none"
			stroke="#FFFFFF"
			stroke-width="8"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<rect x="34" y="52" width="52" height="42" rx="7" fill="#FFFFFF" />
		<rect x="41" y="59" width="11" height="11" rx="2.5" fill="#2456C9" />
		<rect x="54.5" y="59" width="11" height="11" rx="2.5" fill="#2456C9" />
		<rect x="68" y="59" width="11" height="11" rx="2.5" fill="#F2B42C" />
		<rect x="41" y="75" width="11" height="11" rx="2.5" fill="#2456C9" />
		<rect x="54.5" y="75" width="11" height="11" rx="2.5" fill="#2456C9" />
		<rect x="68" y="75" width="11" height="11" rx="2.5" fill="#2456C9" />
	</svg>
</div>

<style>
	.tile {
		background: #161b22;
		box-shadow: 0 0 0 2px var(--tile-edge);
		display: grid;
		place-items: center;
		flex: none;
	}
</style>
