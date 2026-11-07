<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';
	import { ripple } from './ripple.ts';

	interface Props {
		/** assist: 행동 · filter: 켜고 끄기 · input: 입력한 값(지우기 가능). */
		kind?: 'assist' | 'filter' | 'input';
		selected?: boolean;
		icon?: IconName;
		disabled?: boolean;
		elevated?: boolean;
		onclick?: (e: MouseEvent) => void;
		onremove?: () => void;
		removeLabel?: string;
		children: Snippet;
	}
	let {
		kind = 'assist',
		selected = $bindable(false),
		icon,
		disabled = false,
		elevated = false,
		onclick,
		onremove,
		removeLabel = '지우기',
		children
	}: Props = $props();

	function click(e: MouseEvent) {
		if (kind === 'filter') selected = !selected;
		onclick?.(e);
	}
</script>

<span class={`chip ${kind} ${selected ? 'on' : ''} ${elevated ? 'elevated' : ''}`}>
	<button
		type="button"
		class="main md-state md-touch"
		{disabled}
		aria-pressed={kind === 'filter' ? selected : undefined}
		onclick={click}
		use:ripple
	>
		<span class="md-layer" aria-hidden="true"></span>
		{#if kind === 'filter' && selected}
			<Icon name="check" size={18} />
		{:else if icon}
			<Icon name={icon} size={18} />
		{/if}
		<span class="text">{@render children()}</span>
	</button>
	{#if kind === 'input' && onremove}
		<button
			type="button"
			class="remove md-state md-touch"
			aria-label={removeLabel}
			{disabled}
			onclick={onremove}
		>
			<span class="md-layer" aria-hidden="true"></span>
			<Icon name="close" size={18} />
		</button>
	{/if}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		height: 32px;
		border-radius: var(--md-sys-shape-corner-small);
		box-shadow: inset 0 0 0 1px var(--md-sys-color-outline-variant);
		color: var(--md-sys-color-on-surface-variant);
		background: transparent;
		transition:
			background-color var(--md-sys-motion-spring-standard-effects-default-duration)
				var(--md-sys-motion-spring-standard-effects-default),
			border-radius var(--md-sys-motion-spring-expressive-spatial-fast-duration)
				var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.elevated {
		box-shadow: var(--md-sys-elevation-level1);
		background: var(--md-sys-color-surface-container-low);
	}
	.on {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		box-shadow: none;
	}
	.input {
		color: var(--md-sys-color-on-surface);
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		border: 0;
		background: transparent;
		color: inherit;
		font-family: var(--md-ref-typeface-plain);
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: var(--md-sys-typescale-label-large-weight);
		cursor: pointer;
		border-radius: inherit;
	}
	.main {
		padding: 0 16px;
	}
	.main:has(:global(.icon)) {
		padding-left: 8px;
	}
	.input .main {
		padding-right: 4px;
	}
	.remove {
		width: 32px;
		padding: 0;
		justify-content: center;
		margin-right: 2px;
	}
	button:disabled {
		cursor: default;
		color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
	}
	.text {
		position: relative;
	}
</style>
