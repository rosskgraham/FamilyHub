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
	import EventDetail from '#lib/components/EventDetail.svelte';
	import HeatingPanel from '#lib/components/HeatingPanel.svelte';
	import Keyboard from '#lib/components/Keyboard.svelte';
	import Sleep from '#lib/components/Sleep.svelte';
	import { clock } from '#lib/clock.svelte.ts';
	import { eventDetail } from '#lib/event-detail.svelte.ts';
	import { heatingPanel } from '#lib/heating-panel.svelte.ts';
	import { IDLE_MS } from '#lib/idle.ts';
	import { reloadsForRelease, returnsToToday } from '#lib/idle.ts';
	import { isAsleep, sleepPalette } from '#lib/sleep.ts';
	import { cssVariables, palettes } from '#lib/theme.ts';
	import { browser } from '$app/env';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { page, updated } from '$app/state';
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
	const asleep = $derived(browser && isAsleep(clock.now, lastTouch, data.sleepHours.sleep));
	const theme = $derived(asleep ? 'evening' : data.theme);
	function touched() {
		if (!asleep) lastTouch = new Date();
	}

	// In Lights out the screen is dark, and Chromium can't see a touch then, so the Pi's screen service lights the screen
	// and tells the Hub. Asleep, the page asks every second, and wakes for a touch it hasn't seen yet.
	let screenTouches: number | null = null;
	$effect(() => {
		if (!asleep) return;
		const ask = async () => {
			try {
				const { touches } = (await (await fetch('/api/screen')).json()) as { touches: number };
				if (screenTouches !== null && touches !== screenTouches) lastTouch = new Date();
				screenTouches = touches;
			} catch {
				// The Hub's server is restarting, as for a new release: ask again in a second.
			}
		};
		ask();
		const timer = setInterval(ask, 1000);
		return () => clearInterval(timer);
	});

	// Two minutes untouched, the Hub goes back to the Today view, keeping a `?theme=` preview.
	const loadedAt = new Date();
	$effect(() => {
		if (!browser || !returnsToToday(page.url.pathname, clock.now, lastTouch ?? loadedAt)) return;
		const theme = page.url.searchParams.get('theme');
		goto(theme ? `/?theme=${theme}` : '/');
	});

	// While the on-screen keyboard is open, the page slides up so the form being typed in stays above it.
	let lift = $state(0);

	// An Event's detail and the Heating panel close on their own like everything else: two minutes untouched, on going
	// to sleep, or on leaving the page they were opened from.
	$effect(() => {
		if (!eventDetail.shown && !heatingPanel.open) return;
		if (asleep || clock.now.getTime() - (lastTouch ?? loadedAt).getTime() >= IDLE_MS) {
			eventDetail.close();
			heatingPanel.close();
		}
	});
	afterNavigate(() => {
		eventDetail.close();
		heatingPanel.close();
	});

	// The Pi installs a new release by itself (ADR 0004). Once the Hub's been left alone, load its code too.
	$effect(() => {
		if (browser && reloadsForRelease(updated.current, page.url.pathname, clock.now, lastTouch ?? loadedAt))
			location.reload();
	});

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
	<div
		class="stage"
		class:lifted={lift > 0}
		style:--lift="-{lift}px"
		style:transform="translate({left}px, {top}px) scale({scale})"
	>
		<Header weather={data.weather} heating={data.heating} />
		<main>{@render children()}</main>
		<NavBar />
		{#if eventDetail.shown}<EventDetail shown={eventDetail.shown} />{/if}
		{#if heatingPanel.open && data.heating}<HeatingPanel heating={data.heating} />{/if}
		<Keyboard bind:lift />
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
	.stage > :global(header),
	.stage > main,
	.stage > :global(footer) {
		transition: translate 0.2s ease-out;
	}
	.lifted > :global(header),
	.lifted > main,
	.lifted > :global(footer) {
		translate: 0 var(--lift);
	}
	main {
		flex: 1;
		min-height: 0;
		display: flex;
	}
</style>
