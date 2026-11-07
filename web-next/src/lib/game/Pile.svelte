<script lang="ts">
	// 더미(뒷면 + 남은 장수) 또는 버림패(맨 위 + 바로 아래 한 장).
	import { cardText, type CardId, type CardSize } from './cards.ts';
	import { CARD_PX } from './cards.ts';
	import { receive, send } from './motion.svelte.ts';
	import PlayingCard from './PlayingCard.svelte';

	interface Props {
		kind: 'stock' | 'discard';
		size?: CardSize;
		/** 더미 남은 장수. */
		count?: number;
		/** 버림패 (아래 → 위). */
		cards?: CardId[];
		/** 지금 이 더미를 누를 수 있다 (받기, 버리기). */
		active?: boolean;
		/** 지금 고른 카드를 여기 낼 수 있다. */
		target?: boolean;
		onclick?: () => void;
	}
	let {
		kind,
		size = 'md',
		count = 0,
		cards = [],
		active = false,
		target = false,
		onclick
	}: Props = $props();

	const px = $derived(CARD_PX[size]);
	const visible = $derived(cards.slice(-2));
	const top = $derived(cards.at(-1));
	const label = $derived(kind === 'stock' ? `더미 ${count}장` : '버림패');
	const actionLabel = $derived(
		kind === 'stock'
			? `더미에서 받기, ${count}장 남음`
			: `여기에 버리기${top ? `, 맨 위 ${cardText(top)}` : ''}`
	);
</script>

<div
	class={['pile', target && 'target']}
	data-zone={kind}
	data-drop={kind === 'discard' ? 'discard' : undefined}
	style={`--w:${px.w}px;--h:${px.h}px`}
>
	<div class="stack">
		{#if kind === 'stock'}
			{#if count > 0}
				<div class={['thick', count > 8 && 'more']}><PlayingCard {size} /></div>
			{:else}
				<div class="empty"></div>
			{/if}
		{:else}
			<div class="empty"></div>
			{#each visible as card (card)}
				<div class="layer" in:receive={{ key: card }} out:send={{ key: card }}>
					<PlayingCard {card} {size} />
				</div>
			{/each}
		{/if}
		{#if onclick && (active || target)}
			<button type="button" class="hit md-state" aria-label={actionLabel} {onclick}>
				<span class="md-layer" aria-hidden="true"></span>
			</button>
		{/if}
	</div>
	<span class="label" data-testid={`pile-${kind}`}>{label}</span>
</div>

<style>
	.pile {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		flex: none;
		gap: 4px;
	}
	.stack {
		position: relative;
		width: var(--w);
		height: var(--h);
		border-radius: var(--md-sys-shape-corner-medium);
	}
	.layer {
		position: absolute;
		inset: 0;
	}
	.thick {
		border-radius: var(--md-sys-shape-corner-medium);
		box-shadow:
			1px 2px 0 var(--hoola-color-card-back-1),
			1px 2px 0 1px var(--hoola-color-card-edge);
	}
	.thick.more {
		box-shadow:
			1px 2px 0 var(--hoola-color-card-back-1),
			2px 4px 0 var(--hoola-color-card-back-2),
			2px 4px 0 1px var(--hoola-color-card-edge);
	}
	.empty {
		position: absolute;
		inset: 0;
		border: 2px dashed color-mix(in srgb, var(--hoola-color-on-felt) 35%, transparent);
		border-radius: inherit;
	}
	.hit {
		position: absolute;
		z-index: 1;
		inset: 0;
		padding: 0;
		border: 0;
		border-radius: inherit;
		background: transparent;
		color: var(--hoola-color-on-felt);
		cursor: pointer;
	}
	.label {
		font-size: var(--md-sys-typescale-label-medium-size);
		font-weight: var(--md-sys-typescale-label-medium-weight);
		font-variant-numeric: tabular-nums;
		color: var(--hoola-color-on-felt-variant);
		white-space: nowrap;
	}
	.target .stack::after {
		content: '';
		position: absolute;
		inset: -4px;
		border: 2px dashed var(--hoola-color-felt-highlight);
		border-radius: var(--md-sys-shape-corner-large);
		pointer-events: none;
	}
	.pile:global([data-drop-over]) .stack::after {
		border-style: solid;
		border-width: 3px;
	}
</style>
