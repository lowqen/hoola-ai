<script lang="ts">
	import IconButton from './IconButton.svelte';
	import { snackbar } from './snackbar.svelte.ts';
</script>

<div class="host" aria-live="polite" aria-atomic="true">
	{#if snackbar.current}
		{@const s = snackbar.current}
		{#key s.id}
			<div class="snack" role="status" data-testid="snackbar">
				<span class="msg">{s.message}</span>
				{#if s.actionLabel}
					<button type="button" class="action md-state" onclick={() => snackbar.action()}>
						<span class="md-layer" aria-hidden="true"></span>
						{s.actionLabel}
					</button>
				{/if}
				{#if s.closable}
					<IconButton icon="close" label="닫기" class="close" onclick={() => snackbar.dismiss()} />
				{/if}
			</div>
		{/key}
	{/if}
</div>

<style>
	.host {
		position: fixed;
		left: 50%;
		bottom: calc(var(--hoola-snackbar-offset, 16px) + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		z-index: 100;
		width: min(560px, calc(100vw - 32px));
		pointer-events: none;
	}
	.snack {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 4px 8px 4px 16px;
		border-radius: var(--md-sys-shape-corner-extra-small);
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		box-shadow: var(--md-sys-elevation-level3);
		pointer-events: auto;
		animation: in var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.msg {
		flex: 1;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
		padding: 10px 0;
	}
	.action {
		min-height: 40px;
		padding: 0 12px;
		border: 0;
		border-radius: var(--md-sys-shape-corner-full);
		background: transparent;
		color: var(--md-sys-color-inverse-primary);
		font-family: var(--md-ref-typeface-plain);
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: 700;
		cursor: pointer;
	}
	.snack :global(.close) {
		color: var(--md-sys-color-inverse-on-surface);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.98);
		}
	}
</style>
