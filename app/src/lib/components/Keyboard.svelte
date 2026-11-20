<script lang="ts">
	import {
		backspace,
		insert,
		layers,
		startsSentence,
		takesTyping,
		type Edit,
		type Key,
		type Layer
	} from '#lib/keyboard.ts';
	import { onMount, tick } from 'svelte';

	// The Hub's own keyboard (ADR 0009): cage has none. It opens whenever a text box has focus, anywhere on the Hub, and
	// types into it as if the keys were real.

	type Box = HTMLInputElement | HTMLTextAreaElement;

	/** How far the page slides up, in the Hub's pixels, so the form being typed in sits above the keyboard. */
	let { lift = $bindable(0) }: { lift?: number } = $props();
	let panel: HTMLElement | undefined = $state();
	const GAP = 16;

	let target = $state<Box | null>(null);
	let value = $state('');
	let layer: Layer = $state('letters');
	let shift = $state(false);

	const capital = $derived(layer === 'letters' && (shift || startsSentence(value)));
	const enterLabel = $derived.by(() => {
		const submit = target?.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
		return submit?.textContent?.trim() || 'Done';
	});

	const sync = () => target && (value = target.value);

	function attach(box: Box) {
		if (target === box) return;
		target?.removeEventListener('input', sync);
		target = box;
		value = box.value;
		layer = 'letters';
		shift = false;
		box.addEventListener('input', sync);
	}

	function detach() {
		target?.removeEventListener('input', sync);
		target = null;
		lift = 0;
		stopRepeat();
	}

	// The form, or the box when there's no form, goes just above the keyboard if it would be under it. Measured on
	// screen, where the Hub is scaled to fit, then turned back into the Hub's own pixels.
	async function place() {
		await tick();
		if (!target || !panel) return;
		const scale = panel.getBoundingClientRect().height / panel.offsetHeight || 1;
		const bottom = (target.form ?? target).getBoundingClientRect().bottom;
		const under = bottom - panel.getBoundingClientRect().top + GAP * scale;
		lift = Math.max(0, Math.round(lift + under / scale));
	}
	$effect(() => {
		if (target) place();
	});

	onMount(() => {
		const focusin = (e: FocusEvent) => takesTyping(e.target) && attach(e.target);
		// Focus moving from one box to another is a focusin; anywhere else closes the keyboard.
		const focusout = () => setTimeout(() => !takesTyping(document.activeElement) && detach());
		// A box can disappear without losing focus first, such as when Add closes its form.
		const gone = new MutationObserver(() => target && !target.isConnected && detach());
		window.addEventListener('focusin', focusin);
		window.addEventListener('focusout', focusout);
		gone.observe(document.body, { childList: true, subtree: true });
		if (takesTyping(document.activeElement)) attach(document.activeElement);
		return () => {
			window.removeEventListener('focusin', focusin);
			window.removeEventListener('focusout', focusout);
			gone.disconnect();
			detach();
		};
	});

	function apply(edit: Edit) {
		if (!target) return;
		target.value = edit.value;
		target.setSelectionRange(edit.caret, edit.caret);
		// What a real key press sends, so `bind:value` and the box's own handlers see it.
		target.dispatchEvent(new Event('input', { bubbles: true }));
		value = edit.value;
	}

	const selection = (box: Box) =>
		[box.selectionStart ?? box.value.length, box.selectionEnd ?? box.value.length] as const;

	function press(key: Key) {
		const box = target;
		if (!box) return;
		const [start, end] = selection(box);
		switch (key.kind) {
			case 'char':
				apply(insert(box.value, start, end, capital ? key.char.toUpperCase() : key.char, box.maxLength));
				shift = false;
				break;
			case 'space':
				apply(insert(box.value, start, end, ' ', box.maxLength));
				break;
			case 'backspace':
				apply(backspace(box.value, start, end));
				break;
			case 'shift':
				shift = !shift;
				break;
			case 'layer':
				layer = key.to;
				shift = false;
				break;
			case 'hide':
				box.blur();
				break;
			case 'enter':
				if (box.form) box.form.requestSubmit();
				else box.blur();
				break;
		}
	}

	// Holding backspace keeps deleting, after a moment, like a real keyboard.
	let repeat: ReturnType<typeof setTimeout> | undefined;
	function stopRepeat() {
		clearTimeout(repeat);
		clearInterval(repeat);
		repeat = undefined;
	}

	function down(e: PointerEvent, key: Key) {
		// Keeps focus in the box, so the keyboard stays open and the caret stays put.
		e.preventDefault();
		press(key);
		if (key.kind === 'backspace') {
			stopRepeat();
			repeat = setTimeout(() => (repeat = setInterval(() => press(key), 70)), 450);
		}
	}

	const text = (key: Key): string => {
		switch (key.kind) {
			case 'char':
				return capital ? key.char.toUpperCase() : key.char;
			case 'layer':
				return key.label;
			case 'space':
				return 'space';
			case 'enter':
				return enterLabel;
			default:
				return '';
		}
	};

	const names: Partial<Record<Key['kind'], string>> = { shift: 'Shift', backspace: 'Delete', hide: 'Hide keyboard' };
</script>

{#if target}
	<div class="keyboard" role="group" aria-label="On-screen keyboard" bind:this={panel}>
		{#each layers[layer] as row, r (`${layer}-${r}`)}
			<div class="row">
				{#each row as key, k (k)}
					<button
						type="button"
						tabindex="-1"
						class="key {key.kind}"
						aria-label={names[key.kind]}
						aria-pressed={key.kind === 'shift' ? capital : undefined}
						onpointerdown={(e) => down(e, key)}
						onpointerup={stopRepeat}
						onpointerleave={stopRepeat}
						onpointercancel={stopRepeat}
						oncontextmenu={(e) => e.preventDefault()}
					>
						{#if key.kind === 'shift'}
							<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"
								><path
									d="M12 4 3 13h5v7h8v-7h5z"
									fill={capital ? 'currentColor' : 'none'}
									stroke="currentColor"
									stroke-width="2"
									stroke-linejoin="round"
								/></svg
							>
						{:else if key.kind === 'backspace'}
							<svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true"
								><path
									d="M9 5h11v14H9l-6-7zM12.5 9.5l5 5m0-5-5 5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linejoin="round"
									stroke-linecap="round"
								/></svg
							>
						{:else if key.kind === 'hide'}
							<svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true"
								><path
									d="M3 5h18v10H3zM7 8h1m3 0h2m3 0h1M7 12h10M9 19l3 2 3-2"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linejoin="round"
									stroke-linecap="round"
								/></svg
							>
						{:else}
							{text(key)}
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>
{/if}

<style>
	.keyboard {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 8;
		box-sizing: border-box;
		padding: 20px 160px 28px;
		border-radius: 32px 32px 0 0;
		background: var(--segment);
		box-shadow: 0 -12px 40px rgb(0 0 0 / 0.18);
		display: flex;
		flex-direction: column;
		gap: 10px;
		touch-action: manipulation;
		user-select: none;
	}
	.row {
		display: flex;
		gap: 10px;
	}
	.key {
		flex: 1;
		height: 64px;
		padding: 0;
		border: 0;
		border-radius: 16px;
		background: var(--card);
		font-size: 30px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.key:active {
		background: var(--selected);
		filter: brightness(0.92);
	}
	.shift,
	.backspace,
	.layer,
	.hide {
		flex: 1.5;
		background: var(--soft);
		font-size: 24px;
	}
	.shift[aria-pressed='true'] {
		background: var(--card);
	}
	.space {
		flex: 5;
		font-size: 22px;
		color: var(--dim);
	}
	.enter {
		flex: 2.5;
		background: var(--ink);
		color: var(--on-ink);
		font-size: 26px;
		font-weight: 700;
	}
</style>
