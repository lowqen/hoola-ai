<script lang="ts">
	// 바닥 조합 하나. 붙일 수 있으면 강조하고, 누르거나 카드를 놓으면 그 조합으로 간다.
	import { flip } from 'svelte/animate';
	import Icon from '#lib/ui/Icon.svelte';
	import { cardsText, type CardId, type CardSize } from './cards.ts';
	import { receive, reflow, send } from './motion.svelte.ts';
	import PlayingCard from './PlayingCard.svelte';

	export interface MeldInfo {
		id: number;
		kind: 'set' | 'run' | 'seven';
		owner: string;
		cards: CardId[];
	}
	interface Props {
		meld: MeldInfo;
		size?: CardSize;
		target?: boolean;
		onattach?: () => void;
	}
	let { meld, size = 'sm', target = false, onattach }: Props = $props();

	const KIND = { set: '세트', run: '런', seven: '7' };
	const label = $derived(`${meld.owner}의 ${KIND[meld.kind]} ${cardsText(meld.cards)}`);
</script>

<div
	class={['meld', target && 'target']}
	data-drop={`meld-${meld.id}`}
	role="group"
	aria-label={label}
>
	{#each meld.cards as card (card)}
		<div class="slot" in:receive={{ key: card }} out:send={{ key: card }} animate:flip={reflow()}>
			<PlayingCard {card} {size} />
		</div>
	{/each}
	{#if target && onattach}
		<button
			type="button"
			class="hit md-state"
			aria-label={`${label}에 붙이기`}
			data-testid={`attach-${meld.id}`}
			onclick={onattach}
		>
			<span class="md-layer" aria-hidden="true"></span>
			<span class="badge"><Icon name="add" size={16} /></span>
		</button>
	{/if}
</div>

<style>
	.meld {
		position: relative;
		display: inline-flex;
		flex: none;
		padding: 4px;
		border-radius: var(--md-sys-shape-corner-medium);
		background: color-mix(in srgb, var(--hoola-color-on-felt) 10%, transparent);
	}
	.slot {
		position: relative;
		/* 겹쳐도 왼쪽 위 숫자와 무늬는 보인다 */
		margin-left: -14px;
	}
	.slot:first-child {
		margin-left: 0;
	}
	.target {
		box-shadow: 0 0 0 2px var(--hoola-color-felt-highlight);
	}
	.meld:global([data-drop-over]) {
		box-shadow: 0 0 0 4px var(--hoola-color-felt-highlight);
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
	.badge {
		position: absolute;
		top: -8px;
		right: -8px;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--hoola-color-felt-highlight);
		color: #1d1d1b;
	}
</style>
