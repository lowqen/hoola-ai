<script lang="ts">
	// 수마다 추정 승률 막대. 훈련 피드백과 복기가 함께 쓴다.
	import type { Bar } from './training.svelte.ts';

	let {
		bars,
		mineLabel = '내 답',
		bestLabel = '최선'
	}: { bars: Bar[]; mineLabel?: string; bestLabel?: string } = $props();
</script>

<ul class="bars" data-testid="bars">
	{#each bars as bar (bar.text)}
		<li class={[bar.best && 'best']}>
			<span class="label">
				{bar.text}
				{#if bar.mine}<b>{mineLabel}</b>{/if}
				{#if bar.best}<b>{bestLabel}</b>{/if}
			</span>
			<span class="track"
				><span class="fill" style={`width:${Math.max(1, bar.percent)}%`}></span></span
			>
			<span class="value">{bar.percent.toFixed(1)}%</span>
		</li>
	{/each}
</ul>

<style>
	.bars {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--md-sys-typescale-body-small-size);
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 48px;
		align-items: center;
		column-gap: 8px;
	}
	.label {
		grid-column: 1 / -1;
	}
	b {
		padding: 0 6px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface-container-highest);
		color: var(--md-sys-color-on-surface);
		font-size: var(--md-sys-typescale-label-small-size);
	}
	.track {
		overflow: hidden;
		height: 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background: color-mix(in srgb, currentColor 16%, transparent);
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-on-surface-variant);
	}
	.best .fill {
		background: var(--md-sys-color-primary);
	}
	.value {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
