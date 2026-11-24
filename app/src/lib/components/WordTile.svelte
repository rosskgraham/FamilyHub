<script lang="ts">
	import type { Mark } from '#lib/word-game.ts';

	// A tile of Word of the day: a letter with its mark, a letter being typed, or an empty space.
	let {
		letter = '',
		mark,
		size = 104
	}: {
		letter?: string;
		/** Its mark once checked. A letter with none is being typed. */
		mark?: Mark;
		size?: number;
	} = $props();
</script>

<span
	class="tile {mark ?? (letter ? 'typed' : 'empty')}"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{size * 0.54}px"
	style:border-radius="{Math.max(4, size * 0.135)}px">{letter}</span
>

<style>
	.tile {
		flex: none;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		text-transform: uppercase;
		border: 3px solid transparent;
	}
	.right {
		background: var(--word-right);
		color: var(--on-word-right);
	}
	.present {
		background: var(--word-present);
		color: var(--on-word-present);
	}
	.absent {
		background: var(--word-absent);
		color: var(--on-word-absent);
	}
	.typed {
		border-color: var(--ink);
	}
	.empty {
		border-color: var(--line);
	}
</style>
