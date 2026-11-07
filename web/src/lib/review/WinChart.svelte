<script lang="ts">
	// 결정마다 내 수의 추정 승률. 계열이 하나라 범례 대신 등급 표시만 둔다.
	// 키보드와 스크린리더는 같은 내용을 담은 결정 목록을 쓴다.
	import { actionText } from '#lib/play/actions.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import { LEGEND, type GradeId, type ReviewItem } from './analysis.ts';
	import { review } from './review.svelte.ts';

	let {
		items,
		players,
		onselect
	}: { items: ReviewItem[]; players: number; onselect: (index: number) => void } = $props();

	const HEIGHT = 170;
	const PAD = { l: 38, r: 10, t: 12, b: 10 };

	let width = $state(0);
	let hover = $state<number | null>(null);

	const x = (i: number) => PAD.l + (i * (width - PAD.l - PAD.r)) / Math.max(1, items.length - 1);
	const y = (v: number) => PAD.t + (1 - v) * (HEIGHT - PAD.t - PAD.b);
	const fair = $derived(1 / players);
	const line = $derived(items.map((it, i) => `${x(i)},${y(it.mine.value)}`).join(' '));
	const active = $derived(hover ?? review.selected);
	const tip = $derived(hover === null ? null : items[hover]);

	/** 등급 표식 색. 텍스트에는 쓰지 않고, 등급은 항상 이름과 아이콘으로도 보여 준다. */
	const COLOR: Record<GradeId, string> = {
		best: 'var(--md-sys-color-primary)',
		good: 'var(--md-sys-color-primary)',
		table: 'var(--md-sys-color-outline)',
		inaccuracy: 'var(--hoola-color-felt-highlight)',
		mistake: 'var(--md-sys-color-tertiary)',
		blunder: 'var(--md-sys-color-error)'
	};

	function nearest(e: MouseEvent) {
		const box = (e.currentTarget as SVGElement).getBoundingClientRect();
		const step = (width - PAD.l - PAD.r) / Math.max(1, items.length - 1);
		const i = Math.round((e.clientX - box.left - PAD.l) / step);
		return Math.min(items.length - 1, Math.max(0, i));
	}
</script>

<figure class="chart" bind:clientWidth={width}>
	{#if width > 0 && items.length > 1}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<svg
			role="img"
			aria-label={`결정 ${items.length}개의 추정 승률 흐름. 같은 내용을 결정 목록에서 볼 수 있다`}
			{width}
			height={HEIGHT}
			data-testid="win-chart"
			onpointermove={(e) => (hover = nearest(e))}
			onpointerleave={() => (hover = null)}
			onclick={(e) => onselect(nearest(e))}
		>
			{#each [0, 0.5, 1] as v (v)}
				<line class="grid" x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} />
				<text class="axis" x={PAD.l - 6} y={y(v) + 4} text-anchor="end">{v * 100}%</text>
			{/each}
			<line class="fair" x1={PAD.l} x2={width - PAD.r} y1={y(fair)} y2={y(fair)} />
			<line class="cross" x1={x(active)} x2={x(active)} y1={PAD.t} y2={HEIGHT - PAD.b} />
			<polyline class="line" points={line} />
			{#each items as item, i (item.decision.index)}
				<circle
					class="dot"
					cx={x(i)}
					cy={y(item.mine.value)}
					r={i === active ? 7 : item.loss > 0 ? 6 : 4}
					fill={COLOR[item.grade.id]}
				/>
			{/each}
		</svg>
		{#if tip && hover !== null}
			<div
				class="tip"
				role="status"
				style={`left:${Math.min(Math.max(x(hover), 90), width - 90)}px;top:${y(tip.mine.value)}px`}
			>
				<b><Icon name={tip.grade.icon} size={14} />{tip.grade.label}</b> · {tip.n}번째 결정<br />
				{actionText(tip.mine.action, tip.obs, review.seatName)}<br />
				추정 승률 {(tip.mine.value * 100).toFixed(1)}%{#if tip.loss > 0}
					· −{(tip.loss * 100).toFixed(1)}%p{/if}
			</div>
		{/if}
	{/if}
	<figcaption>
		{#each LEGEND as grade (grade.id)}
			<span
				><i style={`background:${COLOR[grade.id]}`}></i>{grade.id === 'best'
					? '최선·좋음'
					: grade.label}</span
			>
		{/each}
		<span><i class="dash"></i>공평한 몫 {Math.round(fair * 100)}%</span>
		<span class="hint">선 = 내 수의 추정 승률 · 점을 누르면 그 장면으로</span>
	</figcaption>
</figure>

<style>
	.chart {
		position: relative;
		margin: 0;
	}
	svg {
		display: block;
		cursor: pointer;
		touch-action: pan-y;
	}
	.grid {
		stroke: var(--md-sys-color-outline-variant);
		stroke-width: 1;
	}
	.fair {
		stroke: var(--md-sys-color-outline);
		stroke-width: 1;
		stroke-dasharray: 4 4;
	}
	.cross {
		stroke: var(--md-sys-color-outline);
		stroke-width: 1;
	}
	.axis {
		fill: var(--md-sys-color-on-surface-variant);
		font-size: 11px;
	}
	.line {
		fill: none;
		stroke: var(--md-sys-color-on-surface-variant);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.dot {
		stroke: var(--md-sys-color-surface);
		stroke-width: 2;
	}
	.tip {
		position: absolute;
		z-index: 1;
		transform: translate(-50%, calc(-100% - 12px));
		width: max-content;
		max-width: 180px;
		padding: 6px 10px;
		border-radius: var(--md-sys-shape-corner-small);
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		font-size: var(--md-sys-typescale-body-small-size);
		line-height: 1.4;
		pointer-events: none;
	}
	.tip b {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 10px;
		margin-top: 4px;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-label-small-size);
	}
	figcaption span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	figcaption i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	figcaption .dash {
		width: 14px;
		height: 0;
		border-top: 1px dashed var(--md-sys-color-outline);
		border-radius: 0;
	}
	.hint {
		flex-basis: 100%;
	}
</style>
