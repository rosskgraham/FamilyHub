<script lang="ts">
	import type { Owner } from '#lib/household.ts';

	let { owner, size = 32 }: { owner: Owner; size?: number } = $props();

	// "All" needs a smaller size than a single initial to fit the circle.
	const fontSize = $derived(owner.initial.length > 1 ? size * 0.44 : size * 0.56);
</script>

<span
	class="badge"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{fontSize}px"
	style:background={owner.solid}
	title={owner.name}>{owner.initial}</span
>

<style>
	.badge {
		flex: none;
		border-radius: 50%;
		color: #ffffff;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
