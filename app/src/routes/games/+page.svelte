<script lang="ts">
	import GamesList from '#lib/components/GamesList.svelte';
	import PlayerCard from '#lib/components/PlayerCard.svelte';
	import WhosPlaying from '#lib/components/WhosPlaying.svelte';
	import WordTile from '#lib/components/WordTile.svelte';
	import { gameStatus } from '#lib/word-game.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- The Games Section with Word of the day chosen, and a card for each Member to start or carry on their game. -->
<div class="games">
	<GamesList chosen="word" />

	<WhosPlaying
		about="Everyone gets the same word today. Tap your name to play."
		when="New word at midnight"
		note="Finished games show only their colours, so nobody sees the word before they've had their go."
	>
		{#each data.cards as card (card.member)}
			{@const owner = data.owners[card.member]!}
			{@const status = gameStatus(card.state, card.goes)}
			{@const playing = card.state === 'new' || card.state === 'playing'}
			<li>
				<PlayerCard
					{owner}
					{status}
					streak={card.streak}
					href={playing ? `/games/${card.member}` : undefined}
					action={card.state === 'new' ? 'Play' : 'Carry on'}
				>
					<span class="grid" role="img" aria-label="{owner.name}: {status}">
						{#each card.marks as row, r (r)}
							<span class="row">
								{#each row as mark, i (i)}<WordTile {mark} size={22} />{/each}
							</span>
						{/each}
					</span>
				</PlayerCard>
			</li>
		{/each}
	</WhosPlaying>
</div>

<style>
	.games {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 24px;
	}
	.grid,
	.row {
		display: flex;
		gap: 4px;
	}
	.grid {
		flex: none;
		flex-direction: column;
	}
</style>
