<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';
	import { ripple } from './ripple.ts';

	type Variant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'danger' | 'danger-tonal';
	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		/** sm 40px · md 56px · lg 72px (M3 Expressive 크기 단계). */
		size?: 'sm' | 'md' | 'lg';
		icon?: IconName;
		trailingIcon?: IconName;
		/** 토글 버튼일 때 선택 상태 (aria-pressed). */
		selected?: boolean;
		wide?: boolean;
		children?: Snippet;
	}
	let {
		variant = 'filled',
		size = 'sm',
		icon,
		trailingIcon,
		selected,
		wide = false,
		children,
		type = 'button',
		class: klass = '',
		...rest
	}: Props = $props();
	const iconSize = $derived(size === 'lg' ? 28 : size === 'md' ? 24 : 20);
</script>

<button
	{...rest}
	{type}
	class={`btn md-state md-touch ${variant} ${size} ${wide ? 'wide' : ''} ${klass}`}
	aria-pressed={selected === undefined ? undefined : selected}
	use:ripple
>
	<span class="md-layer" aria-hidden="true"></span>
	{#if icon}<Icon name={icon} size={iconSize} />{/if}
	{#if children}<span class="label">{@render children()}</span>{/if}
	{#if trailingIcon}<Icon name={trailingIcon} size={iconSize} />{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 0;
		margin: 0;
		cursor: pointer;
		font-family: var(--md-ref-typeface-plain);
		font-weight: var(--md-sys-typescale-label-large-weight);
		letter-spacing: var(--md-sys-typescale-label-large-tracking);
		white-space: nowrap;
		border-radius: var(--md-sys-shape-corner-full);
		/* Expressive: 누르면 모서리가 덜 둥글어진다 (모양 모핑) */
		transition:
			border-radius var(--md-sys-motion-spring-expressive-spatial-fast-duration)
				var(--md-sys-motion-spring-expressive-spatial-fast),
			box-shadow var(--md-sys-motion-spring-standard-effects-default-duration)
				var(--md-sys-motion-spring-standard-effects-default),
			background-color var(--md-sys-motion-spring-standard-effects-default-duration)
				var(--md-sys-motion-spring-standard-effects-default);
	}
	.btn:active:not(:disabled) {
		border-radius: var(--md-sys-shape-corner-medium);
	}
	.sm {
		height: 40px;
		padding: 0 16px;
		font-size: var(--md-sys-typescale-label-large-size);
	}
	.md {
		height: 56px;
		padding: 0 24px;
		font-size: var(--md-sys-typescale-title-medium-size);
	}
	.lg {
		height: 72px;
		padding: 0 32px;
		font-size: var(--md-sys-typescale-title-large-size);
		gap: 12px;
	}
	.sm:has(:global(.icon):first-child) {
		padding-left: 12px;
	}
	.wide {
		width: 100%;
	}
	.filled {
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.tonal {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.outlined {
		background: transparent;
		color: var(--md-sys-color-primary);
		box-shadow: inset 0 0 0 1px var(--md-sys-color-outline-variant);
	}
	.text {
		background: transparent;
		color: var(--md-sys-color-primary);
		padding-left: 12px;
		padding-right: 12px;
	}
	.elevated {
		background: var(--md-sys-color-surface-container-low);
		color: var(--md-sys-color-primary);
		box-shadow: var(--md-sys-elevation-level1);
	}
	.danger {
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
	.danger-tonal {
		background: var(--md-sys-color-error-container);
		color: var(--md-sys-color-on-error-container);
	}
	@media (hover: hover) {
		.filled:hover:not(:disabled),
		.tonal:hover:not(:disabled),
		.danger:hover:not(:disabled) {
			box-shadow: var(--md-sys-elevation-level1);
		}
		.elevated:hover:not(:disabled) {
			box-shadow: var(--md-sys-elevation-level2);
		}
	}
	/* 토글 버튼: 선택되면 채워진 색 */
	.btn[aria-pressed='false'].tonal {
		background: var(--md-sys-color-surface-container-highest);
		color: var(--md-sys-color-on-surface-variant);
	}
	.btn[aria-pressed='true'] {
		border-radius: var(--md-sys-shape-corner-medium);
	}
	.btn:disabled {
		cursor: default;
		background: color-mix(in srgb, var(--md-sys-color-on-surface) 10%, transparent);
		color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
		box-shadow: none;
	}
	.text:disabled,
	.outlined:disabled {
		background: transparent;
	}
	.outlined:disabled {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
	}
	.label {
		position: relative;
	}
</style>
