<script lang="ts">
	// 문제의 고정 행동 바. 안내는 바 위에 떠서 메시지가 나와도 버튼이 움직이지 않는다.
	import type { Snippet } from 'svelte';
	import Dock from './Dock.svelte';
	import { training } from './training.svelte.ts';

	let { message = '', children }: { message?: string; children: Snippet } = $props();
</script>

{#if !training.feedback}
	<Dock>
		<div class="bar" role="toolbar" aria-label="답하기">
			<p class="message" aria-live="polite" data-testid="t-message">{message}</p>
			<div class="row">{@render children()}</div>
		</div>
	</Dock>
{/if}

<style>
	.bar {
		position: relative;
		padding: 10px 12px;
		border-radius: var(--md-sys-shape-corner-extra-large) var(--md-sys-shape-corner-extra-large) 0 0;
		background: var(--md-sys-color-surface-container);
		box-shadow: var(--md-sys-elevation-level2);
	}
	.message {
		position: absolute;
		right: 12px;
		bottom: calc(100% + 8px);
		left: 12px;
		margin: 0;
		padding: 8px 12px;
		border-radius: var(--md-sys-shape-corner-small);
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		font-size: var(--md-sys-typescale-body-small-size);
		line-height: var(--md-sys-typescale-body-small-line-height);
	}
	.message:empty {
		display: none;
	}
	.row {
		display: grid;
		grid-auto-columns: minmax(0, 1fr);
		grid-auto-flow: column;
		gap: 8px;
	}
</style>
