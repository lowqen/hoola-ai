<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';
	import { ripple } from './ripple.ts';

	interface Props extends HTMLButtonAttributes {
		icon: IconName;
		/** 있으면 Extended FAB. 없으면 아이콘만 (이때 label은 필수). */
		children?: Snippet;
		label?: string;
		color?: 'primary' | 'secondary' | 'tertiary';
		size?: 'regular' | 'large';
		/** 숨김 (크기를 줄이며 사라진다, 포커스 불가). */
		hidden?: boolean;
	}
	let {
		icon,
		children,
		label,
		color = 'primary',
		size = 'regular',
		hidden = false,
		type = 'button',
		class: klass = '',
		...rest
	}: Props = $props();
</script>

<button
	{...rest}
	{type}
	class={`fab md-state ${color} ${size} ${children ? 'extended' : ''} ${hidden ? 'gone' : ''} ${klass}`}
	aria-label={children ? undefined : label}
	aria-hidden={hidden ? 'true' : undefined}
	tabindex={hidden ? -1 : rest.tabindex}
	use:ripple
>
	<span class="md-layer" aria-hidden="true"></span>
	<Icon name={icon} size={size === 'large' ? 36 : 24} />
	{#if children}<span class="label">{@render children()}</span>{/if}
</button>

<style>
	.fab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		height: 56px;
		min-width: 56px;
		padding: 0 16px;
		border: 0;
		border-radius: var(--md-sys-shape-corner-large);
		box-shadow: var(--md-sys-elevation-level3);
		cursor: pointer;
		font-family: var(--md-ref-typeface-plain);
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: 700;
		transition:
			transform var(--md-sys-motion-spring-expressive-spatial-default-duration)
				var(--md-sys-motion-spring-expressive-spatial-default),
			opacity var(--md-sys-motion-spring-standard-effects-default-duration)
				var(--md-sys-motion-spring-standard-effects-default),
			box-shadow var(--md-sys-motion-spring-standard-effects-default-duration)
				var(--md-sys-motion-spring-standard-effects-default),
			border-radius var(--md-sys-motion-spring-expressive-spatial-fast-duration)
				var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.extended {
		padding: 0 20px 0 16px;
	}
	.large {
		height: 96px;
		min-width: 96px;
		border-radius: var(--md-sys-shape-corner-extra-large);
		font-size: var(--md-sys-typescale-title-large-size);
	}
	.large.extended {
		padding: 0 28px 0 24px;
	}
	@media (hover: hover) {
		.fab:hover {
			box-shadow: var(--md-sys-elevation-level4);
		}
	}
	.fab:active {
		border-radius: var(--md-sys-shape-corner-medium);
	}
	.primary {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	.secondary {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.tertiary {
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
	}
	.gone {
		transform: scale(0.4);
		opacity: 0;
		pointer-events: none;
	}
	.label {
		position: relative;
	}
</style>
