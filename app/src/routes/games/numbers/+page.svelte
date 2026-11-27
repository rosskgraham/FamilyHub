<script lang="ts">
	import GamesList from '#lib/components/GamesList.svelte';
	import PlayerCard from '#lib/components/PlayerCard.svelte';
	import WhosPlaying from '#lib/components/WhosPlaying.svelte';
	import { numberResult, numberStatus } from '#lib/number-game.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- The Games Section with Number of the day chosen, and a card for each Member to start or carry on their game. -->
<div class="games">
	<GamesList chosen="numbers" />

	<WhosPlaying
		about="Everyone gets the same numbers today. Tap your name to play."
		when="New numbers at midnight"
		note="Finished games show only how close they got, never how, so nobody sees a way to do it before they've had their go."
	>
		{#each data.cards as card (card.member)}
			{@const owner = data.owners[card.member]!}
			{@const playing = card.state === 'new' || card.state === 'playing'}
			<li>
				<PlayerCard
					{owner}
					status={numberStatus(card.state, card.steps)}
					streak={card.streak}
					href={playing ? `/games/numbers/${card.member}` : undefined}
					action={card.state === 'new' ? 'Play' : 'Carry on'}
				>
					<span class="result">{numberResult(card.state, card.away)}</span>
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
	.result {
		flex: none;
		height: 72px;
		padding: 0 28px;
		border-radius: 20px;
		background: var(--card);
		color: var(--ink);
		font-size: 30px;
		font-weight: 700;
		display: flex;
		align-items: center;
	}
</style>
