<script lang="ts">
	let {
		tonight,
		tomorrow
	}: {
		/** The names of tonight's and tomorrow's planned dinners, or null for nothing planned. */
		tonight: string | null;
		tomorrow: string | null;
	} = $props();
</script>

<!-- Tonight's dinner, and tomorrow's underneath, on the Today view (AB#99). A tap opens Meals. -->
<a class="dinner" href="/meals" aria-label="Dinner tonight: {tonight ?? 'nothing planned'}. Open Meals">
	<span class="top">
		<span class="label">Dinner tonight</span>
		<svg
			width="26"
			height="26"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.6"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg
		>
	</span>
	<span class="tonight" class:nothing={!tonight}>{tonight ?? 'Nothing planned'}</span>
	<span class="tomorrow"><b>Tomorrow</b> · {tomorrow ?? 'Nothing planned'}</span>
</a>

<style>
	.dinner {
		flex: none;
		box-sizing: border-box;
		padding: 22px 28px;
		border-radius: 28px;
		background: var(--card);
		color: var(--ink);
		text-decoration: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--dim);
	}
	.label {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.tonight {
		font-size: 52px;
		font-weight: 700;
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tonight.nothing {
		font-size: 40px;
		font-weight: 600;
		color: var(--dim);
	}
	.tomorrow {
		font-size: 24px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
