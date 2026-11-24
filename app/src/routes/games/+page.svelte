<script lang="ts">
	import Badge from '#lib/components/Badge.svelte';
	import WordTile from '#lib/components/WordTile.svelte';
	import { gameStatus, STREAK_SHOWN_FROM, type PlayerCard } from '#lib/word-game.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const status = (card: PlayerCard) => gameStatus(card.state, card.goes);
</script>

{#snippet who(card: PlayerCard)}
	<span class="who">
		<span class="name">{data.owners[card.member]!.name}</span>
		<span class="status">{status(card)}</span>
		{#if card.streak >= STREAK_SHOWN_FROM}<span class="streak">{card.streak} days in a row</span>{/if}
	</span>
{/snippet}

<!-- The Games Section: Word of the day, with a card for each Member to start or carry on their game. -->
<div class="games">
	<section class="list" aria-label="Games">
		<h2>Games</h2>
		<div class="game chosen">
			<div class="sample" aria-hidden="true">
				<WordTile letter="W" mark="right" size={44} />
				<WordTile letter="O" mark="present" size={44} />
				<WordTile letter="R" mark="absent" size={44} />
				<WordTile letter="D" mark="right" size={44} />
			</div>
			<div class="game-name">Word of the day</div>
			<p>A new five-letter word every day. Six goes to find it.</p>
		</div>
		<p class="later">More games can go here later</p>
	</section>

	<section class="players" aria-labelledby="players-title">
		<div class="head">
			<div>
				<h2 id="players-title">Who's playing?</h2>
				<p>Everyone gets the same word today. Tap your name to play.</p>
			</div>
			<p class="when">New word at midnight</p>
		</div>

		<ul>
			{#each data.cards as card (card.member)}
				{@const owner = data.owners[card.member]!}
				<li>
					{#if card.state === 'new' || card.state === 'playing'}
						<a class="card" href="/games/{card.member}" style:background={owner.bg} style:color={owner.fg}>
							<Badge {owner} size={96} />
							{@render who(card)}
							<span class="action" style:background={owner.solid} style:color={owner.on}
								>{card.state === 'new' ? 'Play' : 'Carry on'}</span
							>
						</a>
					{:else}
						<div class="card" style:background={owner.bg} style:color={owner.fg}>
							<Badge {owner} size={96} />
							{@render who(card)}
							<span class="grid" role="img" aria-label="{owner.name}: {status(card)}">
								{#each card.marks as row, r (r)}
									<span class="row">
										{#each row as mark, i (i)}<WordTile {mark} size={22} />{/each}
									</span>
								{/each}
							</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		<p class="note">Finished games show only their colours, so nobody sees the word before they've had their go.</p>
	</section>
</div>

<style>
	.games {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 24px;
	}
	section {
		box-sizing: border-box;
		border-radius: 28px;
		background: var(--card);
		display: flex;
		flex-direction: column;
	}
	h2 {
		margin: 0;
	}
	p {
		margin: 0;
	}
	.list {
		width: 420px;
		flex: none;
		padding: 24px;
		gap: 16px;
	}
	.list h2 {
		font-size: 36px;
	}
	.game {
		padding: 20px;
		border-radius: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.chosen {
		background: var(--soft);
		outline: 3px solid var(--word-right);
		outline-offset: -3px;
	}
	.sample {
		display: flex;
		gap: 6px;
	}
	.game-name {
		font-size: 32px;
		font-weight: 700;
	}
	.game p {
		font-size: 22px;
		color: var(--dim);
	}
	.later {
		flex: 1;
		padding: 20px;
		border-radius: 20px;
		border: 2px dashed var(--line);
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		font-size: 22px;
		color: var(--dim);
	}
	.players {
		flex: 1;
		min-width: 0;
		padding: 32px;
		gap: 24px;
	}
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 24px;
	}
	.head h2 {
		font-size: 48px;
		line-height: 1.1;
	}
	.head p,
	.note {
		font-size: 26px;
		color: var(--dim);
		margin-top: 6px;
	}
	.when {
		font-size: 22px;
	}
	ul {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: minmax(0, 1fr);
		gap: 20px;
	}
	.card {
		height: 100%;
		box-sizing: border-box;
		padding: 24px;
		border-radius: 24px;
		display: flex;
		align-items: center;
		gap: 24px;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.name {
		font-size: 44px;
		font-weight: 700;
		line-height: 1.1;
	}
	.status {
		font-size: 26px;
	}
	.streak {
		font-size: 22px;
	}
	.action {
		flex: none;
		height: 72px;
		padding: 0 32px;
		border-radius: 36px;
		font-size: 28px;
		font-weight: 700;
		display: flex;
		align-items: center;
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
	.note {
		font-size: 22px;
		margin: 0;
	}
</style>
