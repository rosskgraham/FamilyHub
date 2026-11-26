<script lang="ts">
	import type { Snippet } from 'svelte';

	// "Who's playing?" beside the Games list (AB#68, AB#91): a card for each Member, as list items, and a note on what
	// a finished game shows.
	let { about, when, note, children }: { about: string; when: string; note: string; children: Snippet } = $props();
</script>

<section class="players" aria-labelledby="players-title">
	<div class="head">
		<div>
			<h2 id="players-title">Who's playing?</h2>
			<p>{about}</p>
		</div>
		<p class="when">{when}</p>
	</div>

	<ul>
		{@render children()}
	</ul>

	<p class="note">{note}</p>
</section>

<style>
	.players {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 32px;
		border-radius: 28px;
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	h2 {
		margin: 0;
	}
	p {
		margin: 0;
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
	.note {
		font-size: 22px;
		margin: 0;
	}
</style>
