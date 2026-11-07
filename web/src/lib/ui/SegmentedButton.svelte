<script lang="ts" generics="T extends string">
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';
	import { ripple } from './ripple.ts';

	interface Option {
		value: T;
		label: string;
		icon?: IconName;
		disabled?: boolean;
	}
	interface Props {
		options: Option[];
		value: T;
		/** 그룹 이름 (스크린 리더). */
		label: string;
		onchange?: (value: T) => void;
		testid?: string;
	}
	let { options, value = $bindable(), label, onchange, testid }: Props = $props();

	let buttons: HTMLButtonElement[] = $state([]);

	function select(v: T) {
		value = v;
		onchange?.(v);
	}
	function onKey(e: KeyboardEvent, i: number) {
		const step =
			e.key === 'ArrowRight' || e.key === 'ArrowDown'
				? 1
				: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		e.preventDefault();
		const n = options.length;
		for (let k = 1; k <= n; k++) {
			const j = (i + step * k + n) % n;
			if (!options[j].disabled) {
				select(options[j].value);
				buttons[j]?.focus();
				return;
			}
		}
	}
</script>

<div class="seg" role="radiogroup" aria-label={label} data-testid={testid}>
	{#each options as o, i (o.value)}
		{@const on = o.value === value}
		<button
			bind:this={buttons[i]}
			type="button"
			role="radio"
			aria-checked={on}
			tabindex={on ? 0 : -1}
			disabled={o.disabled}
			class="md-state"
			onclick={() => select(o.value)}
			onkeydown={(e) => onKey(e, i)}
			use:ripple
		>
			<span class="md-layer" aria-hidden="true"></span>
			{#if on}<Icon name="check" size={18} />{:else if o.icon}<Icon name={o.icon} size={18} />{/if}
			<span>{o.label}</span>
		</button>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		border-radius: var(--md-sys-shape-corner-full);
		box-shadow: inset 0 0 0 1px var(--md-sys-color-outline);
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 48px;
		height: 40px;
		padding: 0 14px;
		border: 0;
		border-right: 1px solid var(--md-sys-color-outline);
		background: transparent;
		color: var(--md-sys-color-on-surface);
		font-family: var(--md-ref-typeface-plain);
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: var(--md-sys-typescale-label-large-weight);
		cursor: pointer;
		transition: background-color var(--md-sys-motion-spring-standard-effects-default-duration)
			var(--md-sys-motion-spring-standard-effects-default);
	}
	button:first-child {
		border-radius: var(--md-sys-shape-corner-full) 0 0 var(--md-sys-shape-corner-full);
		padding-left: 16px;
	}
	button:last-child {
		border-right: 0;
		border-radius: 0 var(--md-sys-shape-corner-full) var(--md-sys-shape-corner-full) 0;
		padding-right: 16px;
	}
	button[aria-checked='true'] {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	button:disabled {
		color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
		cursor: default;
	}
</style>
