<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Badge from '#lib/components/Badge.svelte';
	import Celebration from '#lib/components/Celebration.svelte';
	import WordTile from '#lib/components/WordTile.svelte';
	import {
		gameStatus,
		keyboardMarks,
		MAX_GOES,
		WORD_LENGTH,
		type GameEnd,
		type Go,
		type Mark
	} from '#lib/word-game.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
	const problems: Record<string, string> = {
		'too short': 'Five letters needed',
		'not a word': 'That isn’t a word the Hub knows'
	};

	let typed = $state('');
	let problem: string | null = $state(null);
	let checking = $state(false);
	// A game that's just finished: its last go stays on the board until the end is seen.
	let ended = $state<(GameEnd & { goes: Go[]; solved: boolean }) | null>(null);

	const goes = $derived(ended?.goes ?? data.goes);
	const keys = $derived(keyboardMarks(goes));
	const board = $derived(
		Array.from({ length: MAX_GOES }, (_, row) => {
			const go = goes[row];
			if (go) return [...go.word].map((letter, i) => ({ letter, mark: go.marks[i] as Mark | undefined }));
			const letters = row === goes.length && !ended ? typed : '';
			return Array.from({ length: WORD_LENGTH }, (_, i) => ({ letter: letters[i] ?? '', mark: undefined }));
		})
	);

	function type(letter: string) {
		problem = null;
		if (typed.length < WORD_LENGTH) typed += letter;
	}

	function rubOut() {
		problem = null;
		typed = typed.slice(0, -1);
	}

	async function check() {
		if (checking || ended) return;
		if (typed.length < WORD_LENGTH) {
			problem = problems['too short']!;
			return;
		}
		checking = true;
		try {
			const response = await fetch('/api/games/word', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ member: data.member, word: typed })
			});
			const result = await response.json().catch(() => null);
			if (response.status === 422) {
				problem = problems[result?.problem] ?? 'That didn’t count. Try another word.';
			} else if (!response.ok || !result?.ok) {
				problem = 'That didn’t save. Try again.';
			} else {
				typed = '';
				if (result.end) {
					ended = { ...result.end, goes: [...data.goes, result.go], solved: result.state === 'solved' };
				} else {
					await invalidateAll();
				}
			}
		} catch {
			problem = 'Couldn’t reach the Hub. Try again.';
		}
		checking = false;
	}

	// A PC's keyboard works too, though the wall has only the screen.
	function onkeydown(event: KeyboardEvent) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (/^[a-z]$/i.test(event.key)) type(event.key.toLowerCase());
		else if (event.key === 'Backspace') rubOut();
		else if (event.key === 'Enter') check();
		else return;
		event.preventDefault();
	}
</script>

<svelte:window {onkeydown} />

<div class="play">
	<section class="board" aria-label="{data.owner.name}’s board">
		{#each board as row, r (r)}
			<div class="row" aria-label="Go {r + 1}">
				{#each row as tile, i (i)}<WordTile letter={tile.letter} mark={tile.mark} />{/each}
			</div>
		{/each}
	</section>

	<section class="side">
		<div class="head">
			<Badge owner={data.owner} size={80} />
			<div class="who">
				<h2>{data.owner.name}’s word of the day</h2>
				<p>Go {Math.min(goes.length + 1, MAX_GOES)} of {MAX_GOES}</p>
			</div>
			<a class="stop" href="/games">Stop for now</a>
		</div>

		<ul class="key-to-colours">
			<li><WordTile mark="right" size={32} />Right letter, right place</li>
			<li><WordTile mark="present" size={32} />In the word, somewhere else</li>
			<li><WordTile mark="absent" size={32} />Not in the word</li>
		</ul>

		<p class="message" role="alert">{problem ?? ''}</p>

		<div class="keyboard" role="group" aria-label="Letters">
			{#each ROWS as row, r (r)}
				<div class="keys">
					{#if r === 2}
						<button class="key wide check" onclick={check} disabled={checking}>Check</button>
					{/if}
					{#each [...row] as letter (letter)}
						<button class="key {keys.get(letter) ?? ''}" onclick={() => type(letter)}>{letter}</button>
					{/each}
					{#if r === 2}
						<button class="key wide" onclick={rubOut} aria-label="Delete a letter">⌫</button>
					{/if}
				</div>
			{/each}
		</div>
	</section>
</div>

{#if ended}
	{@const days = `${ended.streak} ${ended.streak === 1 ? 'day' : 'days'} in a row`}
	<Celebration
		owner={data.owner}
		title={ended.solved ? `You got it, ${data.owner.name}!` : `The word was ${ended.answer.toUpperCase()}`}
		cheer={ended.solved}
		close={ended.solved ? 'Nice one!' : 'OK'}
		onclose={() => goto('/games', { invalidateAll: true })}
	>
		<p class="how">
			{ended.solved
				? `In ${ended.goes.length} ${ended.goes.length === 1 ? 'go' : 'goes'}. That’s ${days}.`
				: `Good try! Your streak carries on: ${days}.`}
		</p>
		<ul class="family" aria-label="Everyone today">
			{#each ended.cards as card (card.member)}
				{@const owner = data.owners[card.member]!}
				<li><Badge {owner} size={56} /><span>{gameStatus(card.state, card.goes)}</span></li>
			{/each}
		</ul>
	</Celebration>
{/if}

<style>
	.play {
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
	.board {
		width: 660px;
		flex: none;
		padding: 24px;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}
	.row {
		display: flex;
		gap: 10px;
	}
	.side {
		flex: 1;
		min-width: 0;
		padding: 28px 32px;
		gap: 20px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 20px;
	}
	.who {
		flex: 1;
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 44px;
		line-height: 1.1;
	}
	p {
		margin: 0;
	}
	.who p {
		font-size: 26px;
		color: var(--dim);
		margin-top: 4px;
	}
	.stop {
		flex: none;
		height: 72px;
		padding: 0 28px;
		border-radius: 36px;
		border: 2px solid var(--line);
		display: flex;
		align-items: center;
		font-size: 26px;
		font-weight: 600;
	}
	.key-to-colours {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		gap: 28px;
		font-size: 24px;
		color: var(--dim);
	}
	.key-to-colours li {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.message {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		font-weight: 600;
		color: var(--problem);
	}
	.keyboard {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.keys {
		display: flex;
		gap: 10px;
	}
	.key {
		width: 100px;
		height: 104px;
		padding: 0;
		border: none;
		border-radius: 16px;
		background: var(--segment);
		color: var(--ink);
		font-size: 40px;
		font-weight: 700;
		text-transform: uppercase;
	}
	.key.wide {
		width: 160px;
		font-size: 36px;
	}
	.key.check {
		font-size: 28px;
		text-transform: none;
		background: var(--ink);
		color: var(--on-ink);
	}
	.key.right {
		background: var(--word-right);
		color: var(--on-word-right);
	}
	.key.present {
		background: var(--word-present);
		color: var(--on-word-present);
	}
	/* A letter that isn't in the word is used up: outlined and dimmer, unlike the filled keys still to try. */
	.key.absent {
		background: var(--card);
		box-shadow: inset 0 0 0 2px var(--line);
		color: var(--dim);
	}
	.how {
		font-size: 36px;
		color: var(--dim);
	}
	.family {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		gap: 16px;
	}
	.family li {
		width: 180px;
		box-sizing: border-box;
		padding: 16px;
		border-radius: 20px;
		background: var(--soft);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		font-size: 24px;
		font-weight: 600;
	}
</style>
