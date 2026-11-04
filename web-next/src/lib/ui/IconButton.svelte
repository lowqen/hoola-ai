<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';
	import { ripple } from './ripple.ts';

	interface Props extends HTMLButtonAttributes {
		icon: IconName;
		/** 화면에 글자가 없으므로 필수 (스크린 리더용). */
		label: string;
		variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
		/** 토글이면 선택 상태. */
		selected?: boolean;
		selectedIcon?: IconName;
	}
	let {
		icon,
		label,
		variant = 'standard',
		selected,
		selectedIcon,
		type = 'button',
		class: klass = '',
		...rest
	}: Props = $props();
</script>

<button
	{...rest}
	{type}
	class={`ib md-state md-touch ${variant} ${klass}`}
	aria-label={label}
	title={label}
	aria-pressed={selected === undefined ? undefined : selected}
	use:ripple
>
	<span class="md-layer" aria-hidden="true"></span>
	<Icon name={selected && selectedIcon ? selectedIcon : icon} />
</button>

<style>
	.ib {
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border: 0;
		border-radius: var(--md-sys-shape-corner-full);
		background: transparent;
		color: var(--md-sys-color-on-surface-variant);
		cursor: pointer;
		transition: border-radius var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.ib:active:not(:disabled),
	.ib[aria-pressed='true'] {
		border-radius: var(--md-sys-shape-corner-medium);
	}
	.standard[aria-pressed='true'] {
		color: var(--md-sys-color-primary);
	}
	.filled {
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.filled[aria-pressed='false'] {
		background: var(--md-sys-color-surface-container-highest);
		color: var(--md-sys-color-primary);
	}
	.tonal {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.tonal[aria-pressed='false'] {
		background: var(--md-sys-color-surface-container-highest);
		color: var(--md-sys-color-on-surface-variant);
	}
	.outlined {
		box-shadow: inset 0 0 0 1px var(--md-sys-color-outline-variant);
	}
	.outlined[aria-pressed='true'] {
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		box-shadow: none;
	}
	.ib:disabled {
		cursor: default;
		color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
		background: transparent;
	}
	.filled:disabled,
	.tonal:disabled {
		background: color-mix(in srgb, var(--md-sys-color-on-surface) 10%, transparent);
	}
</style>
