<script lang="ts">
	import type { GameName } from '#lib/games.ts';
	import WordTile from './WordTile.svelte';

	// The Games Section's list of games (AB#91), with the one chosen outlined. Choosing one shows its players.
	let { chosen }: { chosen: GameName } = $props();
</script>

<section class="list" aria-label="Games">
	<h2>Games</h2>
	<a class="game" class:chosen={chosen === 'word'} href="/games?game=word" aria-current={chosen === 'word'}>
		<span class="sample" aria-hidden="true">
			<WordTile letter="W" mark="right" size={44} />
			<WordTile letter="O" mark="present" size={44} />
			<WordTile letter="R" mark="absent" size={44} />
			<WordTile letter="D" mark="right" size={44} />
		</span>
		<span class="game-name">Word of the day</span>
		<span class="about">A new five-letter word every day. Six goes to find it.</span>
	</a>
	<a class="game" class:chosen={chosen === 'numbers'} href="/games/numbers" aria-current={chosen === 'numbers'}>
		<span class="sample" aria-hidden="true">
			<span class="target">605</span>
			<span class="tile">75</span>
			<span class="tile">×</span>
			<span class="tile">8</span>
		</span>
		<span class="game-name">Number of the day</span>
		<span class="about">Six numbers and a target. Add, take away, times and divide to reach it.</span>
	</a>
</section>

<style>
	.list {
		width: 420px;
		flex: none;
		box-sizing: border-box;
		padding: 24px;
		border-radius: 28px;
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		margin: 0;
		font-size: 36px;
	}
	.game {
		padding: 20px;
		border-radius: 20px;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 14px;
		text-decoration: none;
		color: var(--ink);
	}
	.chosen {
		background: var(--soft);
		outline: 3px solid var(--word-right);
		outline-offset: -3px;
	}
	.sample {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.target,
	.tile {
		height: 44px;
		box-sizing: border-box;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.target {
		padding: 0 12px;
		background: var(--ink);
		color: var(--on-ink);
		font-size: 26px;
	}
	.tile {
		width: 44px;
		background: var(--card);
		border: 2px solid var(--line);
		font-size: 22px;
	}
	.game-name {
		font-size: 32px;
		font-weight: 700;
	}
	.about {
		font-size: 22px;
		color: var(--dim);
	}
</style>
