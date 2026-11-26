<script lang="ts">
	import { goto } from '$app/navigation';
	import Badge from '#lib/components/Badge.svelte';
	import {
		closest,
		isNumberGameFinished,
		numberStatus,
		OPERATORS,
		REFUSALS,
		type NumberGame,
		type Operator,
		type Refusal
	} from '#lib/number-game.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const NAMES: Record<Operator, string> = { '+': 'Add', '−': 'Take away', '×': 'Times', '÷': 'Divide' };

	// The game as the Hub last sent it, after each move.
	let moved = $state<NumberGame | null>(null);
	const game = $derived(moved ?? data.game);
	const near = $derived(closest(game.numbers, game.target));

	// The step being made: the place of the first number chosen, and the sign.
	let first = $state<number | null>(null);
	let op = $state<Operator | null>(null);
	let finishing = $state(false);
	let problem: string | null = $state(null);
	let busy = $state(false);

	const hint = $derived(
		finishing
			? 'Which number are you finishing with?'
			: first === null
				? 'Tap a number'
				: op === null
					? 'Now tap a sign'
					: 'Now tap a number'
	);

	async function send(move: Record<string, unknown>) {
		if (busy) return;
		busy = true;
		problem = null;
		try {
			const response = await fetch('/api/games/numbers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ member: data.member, ...move })
			});
			const result = await response.json().catch(() => null);
			if (response.status === 422) {
				problem = REFUSALS[result?.problem as Refusal] ?? 'That didn’t count. Try another.';
			} else if (!response.ok || !result?.ok) {
				problem = 'That didn’t save. Try again.';
			} else {
				moved = result.game;
				if (isNumberGameFinished(result.game.state)) await goto('/games/numbers', { invalidateAll: true });
			}
			// Done or refused, the next step starts afresh.
			[first, op, finishing] = [null, null, false];
		} catch {
			problem = 'Couldn’t reach the Hub. Try again.';
		}
		busy = false;
	}

	function tapNumber(i: number) {
		problem = null;
		if (finishing) send({ kind: 'finish', value: game.numbers[i] });
		else if (first === i) [first, op] = [null, null];
		else if (first === null || op === null) first = i;
		else send({ kind: 'step', a: game.numbers[first], op, b: game.numbers[i] });
	}

	function tapSign(sign: Operator) {
		problem = null;
		if (first !== null && !finishing) op = op === sign ? null : sign;
	}

	function toggleFinishing() {
		problem = null;
		[first, op] = [null, null];
		finishing = !finishing;
	}
</script>

<div class="play">
	<section class="numbers" aria-label="{data.owner.name}’s numbers">
		<div class="aim">
			<span class="label" id="target-label">Target</span>
			<span class="target" aria-labelledby="target-label">{game.target}</span>
			<span class="near">Closest so far: {near}, which is {Math.abs(near - game.target)} away</span>
		</div>

		<div class="tiles" role="group" aria-label="Numbers left">
			{#each game.numbers as n, i (i)}
				<button
					class="tile"
					class:chosen={first === i}
					class:pick={finishing}
					class:three={String(n).length === 3}
					class:long={String(n).length === 4}
					class:longer={String(n).length > 4}
					aria-pressed={first === i}
					onclick={() => tapNumber(i)}
					disabled={busy}>{n}</button
				>
			{/each}
		</div>

		<div class="bar">
			<span class="making">
				{#if first !== null}{[game.numbers[first], op].filter(Boolean).join(' ')} <span class="missing">?</span>{/if}
			</span>
			<span class="hint" class:problem role="alert">{problem ?? hint}</span>
		</div>

		<div class="signs" role="group" aria-label="Signs">
			{#each OPERATORS as sign (sign)}
				<button
					class="sign"
					class:chosen={op === sign}
					aria-label={NAMES[sign]}
					aria-pressed={op === sign}
					onclick={() => tapSign(sign)}
					disabled={busy || finishing}>{sign}</button
				>
			{/each}
		</div>
	</section>

	<section class="side">
		<div class="head">
			<Badge owner={data.owner} size={80} />
			<div class="who">
				<h2>{data.owner.name}’s number of the day</h2>
				<p>{game.steps.length ? numberStatus('playing', game.steps.length) : 'No steps yet'}</p>
			</div>
			<a class="stop" href="/games/numbers">Stop for now</a>
		</div>

		<p class="how">Tap a number, a sign, then another number. Each number can be used once.</p>

		<ol class="steps" aria-label="Steps so far">
			{#each game.steps as step, i (i)}
				<li>{step.a} {step.op} {step.b} = {step.answer}</li>
			{/each}
		</ol>

		<div class="buttons">
			<button class="undo" onclick={() => send({ kind: 'undo' })} disabled={busy || !game.steps.length}>
				<svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M9 14 4 9l5-5" />
					<path d="M4 9h11a5 5 0 0 1 0 10h-3" />
				</svg>
				Undo
			</button>
			<button onclick={() => send({ kind: 'restart' })} disabled={busy || !game.steps.length}>Start again</button>
			<button class="finish" onclick={toggleFinishing} disabled={busy}>{finishing ? 'Not yet' : 'Finish with…'}</button>
		</div>
	</section>
</div>

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
		padding: 28px 32px;
	}
	.numbers {
		width: 940px;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: 24px;
	}
	.aim {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.label {
		font-size: 28px;
		font-weight: 600;
		color: var(--dim);
	}
	.target {
		height: 168px;
		padding: 0 48px;
		border-radius: 28px;
		background: var(--ink);
		color: var(--on-ink);
		font-size: 136px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.02em;
		display: flex;
		align-items: center;
		font-variant-numeric: tabular-nums;
	}
	.near {
		font-size: 26px;
		margin-top: 8px;
	}
	.tiles,
	.signs {
		display: flex;
		gap: 16px;
	}
	button {
		font: inherit;
		color: var(--ink);
	}
	.tile,
	.sign {
		box-sizing: border-box;
		border-radius: 22px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-variant-numeric: tabular-nums;
	}
	.tile {
		width: 130px;
		height: 140px;
		border: 3px solid var(--line);
		background: var(--card);
		font-size: 64px;
		font-weight: 700;
	}
	.tile.three {
		font-size: 54px;
	}
	.tile.long {
		font-size: 42px;
	}
	.tile.longer {
		font-size: 34px;
	}
	/* Choosing the number to finish with: every tile is a choice. */
	.tile.pick {
		border-color: var(--ink);
	}
	.sign {
		width: 160px;
		height: 120px;
		border: 3px solid var(--segment);
		background: var(--segment);
		font-size: 64px;
		font-weight: 600;
	}
	.chosen {
		border-color: var(--word-right);
		background: var(--word-right);
		color: var(--on-word-right);
	}
	.bar {
		width: 760px;
		height: 96px;
		box-sizing: border-box;
		padding: 0 32px;
		border-radius: 22px;
		background: var(--soft);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}
	.making {
		font-size: 52px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.missing {
		color: var(--dim);
	}
	.hint {
		font-size: 24px;
		color: var(--dim);
		text-align: right;
	}
	.hint.problem {
		font-size: 28px;
		font-weight: 600;
		color: var(--problem);
	}
	.side {
		flex: 1;
		min-width: 0;
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
		font-size: 36px;
		line-height: 1.1;
	}
	p {
		margin: 0;
	}
	.who p,
	.how {
		font-size: 26px;
		color: var(--dim);
	}
	.who p {
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
	.steps {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow: hidden;
	}
	.steps li {
		height: 64px;
		flex: none;
		box-sizing: border-box;
		padding: 0 28px;
		border-radius: 18px;
		background: var(--soft);
		display: flex;
		align-items: center;
		font-size: 38px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.buttons {
		display: flex;
		gap: 16px;
	}
	.buttons button {
		flex: 1;
		height: 104px;
		border-radius: 22px;
		border: 2px solid var(--line);
		background: var(--card);
		font-size: 30px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
	}
	.buttons button:disabled {
		color: var(--dim);
	}
	.undo svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.buttons .finish {
		flex: 1.3;
		border: none;
		background: var(--ink);
		color: var(--on-ink);
	}
</style>
