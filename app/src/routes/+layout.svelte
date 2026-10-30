<script lang="ts">
	// Figtree is served by the Hub itself, so it still shows when the Wi-Fi is down.
	import '@fontsource/figtree/400.css';
	import '@fontsource/figtree/500.css';
	import '@fontsource/figtree/600.css';
	import '@fontsource/figtree/700.css';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Header from '#lib/components/Header.svelte';
	import NavBar from '#lib/components/NavBar.svelte';
	import Sleep from '#lib/components/Sleep.svelte';
	import { clock } from '#lib/clock.svelte.ts';
	import { isAsleep, sleepPalette } from '#lib/sleep.ts';
	import { cssVariables, palettes } from '#lib/theme.ts';
	import { browser } from '$app/env';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The Hub is designed at 1920×1080 and scaled to fit whatever window it's in.
	const WIDTH = 1920;
	const HEIGHT = 1080;
	let innerWidth = $state(WIDTH);
	let innerHeight = $state(HEIGHT);
	const scale = $derived(Math.min(innerWidth / WIDTH, innerHeight / HEIGHT));
	const left = $derived((innerWidth - WIDTH * scale) / 2);
	const top = $derived((innerHeight - HEIGHT * scale) / 2);

	// Overnight the Hub sleeps until it's touched, and goes back to Sleep two minutes after the last touch.
	// Only in the browser, which has the real clock and the touches.
	let lastTouch: Date | null = $state(null);
	const asleep = $derived(browser && isAsleep(clock.now, lastTouch));
	const theme = $derived(asleep ? 'evening' : data.theme);
	function touched() {
		if (!asleep) lastTouch = new Date();
	}

	// Check for changes every minute.
	onMount(() => {
		const timer = setInterval(() => invalidateAll(), 60_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>FamilyHub</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window bind:innerWidth bind:innerHeight onpointerdowncapture={touched} />

<!-- The theme changes within a minute of sunset or sunrise, when the page next checks for changes. -->
<div class="hub {theme}" style={cssVariables(palettes[theme])} style:background={asleep ? sleepPalette.bg : null}>
	<div class="stage" style:transform="translate({left}px, {top}px) scale({scale})">
		<Header weather={data.weather} />
		<main>{@render children()}</main>
		<NavBar />
		{#if asleep}
			<Sleep events={data.sleep.events} owners={data.sleep.owners} onwake={() => (lastTouch = new Date())} />
		{/if}
	</div>
</div>

<style>
	.hub {
		position: fixed;
		inset: 0;
		background: var(--bg);
		color: var(--ink);
		color-scheme: light;
	}
	.hub.evening {
		color-scheme: dark;
	}
	.stage {
		position: absolute;
		left: 0;
		top: 0;
		width: 1920px;
		height: 1080px;
		box-sizing: border-box;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		transform-origin: 0 0;
	}
	main {
		flex: 1;
		min-height: 0;
		display: flex;
	}
</style>
