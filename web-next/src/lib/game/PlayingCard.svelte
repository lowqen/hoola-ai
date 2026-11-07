<script lang="ts">
	// 카드 한 장. 색은 테마를 따르지 않는 고정 색(크림 앞면, 빨강, 뒷면)이다 (DESIGN_PLAN §3.1).
	import {
		CARD_PX,
		cardAria,
		isRed,
		rankLabel,
		suitSymbol,
		type CardId,
		type CardSize
	} from './cards.ts';

	interface Props {
		/** 없으면 뒷면. */
		card?: CardId;
		size?: CardSize;
		selected?: boolean;
		/** 복기 표시: 내가 둔 수 / 추천 수. 색과 글자를 함께 쓴다. */
		mark?: 'mine' | 'best';
		/** 손에 든 카드만 그림자를 쓴다 (§3.4). */
		raised?: boolean;
		tabindex?: number;
		/** 있으면 버튼으로 그린다. */
		onclick?: (e: MouseEvent) => void;
	}
	let {
		card,
		size = 'md',
		selected = false,
		mark,
		raised = false,
		tabindex,
		onclick
	}: Props = $props();

	const px = $derived(CARD_PX[size]);
	const classes = $derived(
		[
			'card',
			card ? 'face' : 'back',
			card && isRed(card) ? 'red' : '',
			selected ? 'selected' : '',
			raised ? 'raised' : '',
			mark ? `mark-${mark}` : ''
		]
			.filter(Boolean)
			.join(' ')
	);
	const style = $derived(`--w:${px.w}px;--h:${px.h}px`);
	const label = $derived(
		card ? `${cardAria(card)}${mark ? (mark === 'mine' ? ', 내 수' : ', 추천') : ''}` : undefined
	);
</script>

{#snippet content()}
	{#if card}
		<span class="corner" aria-hidden="true">
			<span class="rank">{rankLabel(card)}</span>
			<span class="suit">{suitSymbol(card)}</span>
		</span>
		<span class="pip" aria-hidden="true">{suitSymbol(card)}</span>
		{#if mark}
			<span class="tag" aria-hidden="true">{mark === 'mine' ? '내 수' : '추천'}</span>
		{/if}
	{/if}
{/snippet}

{#if onclick}
	<button
		type="button"
		class={classes}
		{style}
		{tabindex}
		{onclick}
		data-card={card ?? 'back'}
		aria-label={label}
		aria-pressed={selected}
	>
		{@render content()}
	</button>
{:else if card}
	<span class={classes} {style} data-card={card} role="img" aria-label={label}>
		{@render content()}
	</span>
{:else}
	<span class={classes} {style} data-card="back" aria-hidden="true"></span>
{/if}

<style>
	.card {
		position: relative;
		display: block;
		flex: none;
		width: var(--w);
		height: var(--h);
		padding: 0;
		border: 0;
		border-radius: var(--md-sys-shape-corner-medium);
		overflow: hidden;
		user-select: none;
		font-family: var(--md-ref-typeface-plain);
		font-variant-numeric: tabular-nums;
		-webkit-tap-highlight-color: transparent;
		transition: border-radius var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	button.card {
		cursor: pointer;
		touch-action: none;
	}
	.face {
		background: var(--hoola-color-card-face);
		color: var(--hoola-color-card-ink);
		box-shadow: inset 0 0 0 1px var(--hoola-color-card-edge);
	}
	.red {
		color: var(--hoola-color-card-red);
	}
	.back {
		background: repeating-linear-gradient(
			45deg,
			var(--hoola-color-card-back-1) 0 5px,
			var(--hoola-color-card-back-2) 5px 10px
		);
		box-shadow:
			inset 0 0 0 1px var(--hoola-color-card-edge),
			inset 0 0 0 3px var(--hoola-color-card-face);
	}
	.raised {
		box-shadow:
			inset 0 0 0 1px var(--hoola-color-card-edge),
			var(--md-sys-elevation-level1);
	}
	.selected {
		border-radius: var(--md-sys-shape-corner-large);
		box-shadow:
			inset 0 0 0 3px var(--md-sys-color-tertiary),
			var(--md-sys-elevation-level3);
	}
	.corner {
		position: absolute;
		top: calc(var(--h) * 0.05);
		left: calc(var(--w) * 0.09);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1;
		font-weight: 800;
	}
	.rank {
		font-size: calc(var(--h) * 0.25);
		letter-spacing: -0.03em;
	}
	.suit {
		font-size: calc(var(--h) * 0.22);
	}
	.pip {
		position: absolute;
		right: calc(var(--w) * 0.08);
		bottom: calc(var(--h) * 0.03);
		font-size: calc(var(--h) * 0.42);
		line-height: 1;
	}
	.mark-mine {
		box-shadow: inset 0 0 0 3px var(--md-sys-color-error);
	}
	.mark-best {
		box-shadow: inset 0 0 0 3px var(--md-sys-color-primary);
	}
	.tag {
		position: absolute;
		inset: auto 0 0;
		padding: 1px 0;
		font-size: 11px;
		font-weight: 700;
		line-height: 1.3;
		text-align: center;
	}
	.mark-mine .tag {
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
	.mark-best .tag {
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
</style>
