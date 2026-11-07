<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ripple } from './ripple.ts';

	interface Props {
		variant?: 'filled' | 'outlined' | 'elevated';
		/** 누를 수 있는 카드면 onclick 또는 href (전체가 하나의 버튼/링크가 된다). */
		onclick?: (e: MouseEvent) => void;
		href?: string;
		label?: string;
		children: Snippet;
	}
	let { variant = 'filled', onclick, href, label, children }: Props = $props();
</script>

{#if href}
	<a class={`card md-state interactive ${variant}`} {href} aria-label={label} use:ripple>
		<span class="md-layer" aria-hidden="true"></span>
		{@render children()}
	</a>
{:else if onclick}
	<button
		type="button"
		class={`card md-state interactive ${variant}`}
		{onclick}
		aria-label={label}
		use:ripple
	>
		<span class="md-layer" aria-hidden="true"></span>
		{@render children()}
	</button>
{:else}
	<div class={`card ${variant}`}>{@render children()}</div>
{/if}

<style>
	.card {
		display: block;
		position: relative;
		padding: 16px;
		border: 0;
		border-radius: var(--md-sys-shape-corner-medium);
		color: var(--md-sys-color-on-surface);
		text-align: left;
		text-decoration: none;
		font: inherit;
		width: 100%;
	}
	.interactive {
		cursor: pointer;
		transition: box-shadow var(--md-sys-motion-spring-standard-effects-default-duration)
			var(--md-sys-motion-spring-standard-effects-default);
	}
	.filled {
		background: var(--md-sys-color-surface-container-highest);
	}
	.outlined {
		background: var(--md-sys-color-surface);
		box-shadow: inset 0 0 0 1px var(--md-sys-color-outline-variant);
	}
	.elevated {
		background: var(--md-sys-color-surface-container-low);
		box-shadow: var(--md-sys-elevation-level1);
	}
	@media (hover: hover) {
		.interactive.filled:hover,
		.interactive.elevated:hover {
			box-shadow: var(--md-sys-elevation-level2);
		}
	}
</style>
