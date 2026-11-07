<script lang="ts">
	// 내 손패. 탭 = 선택, 두 번 탭 = 버리기, 끌기 = 놓은 곳에 내기, ←/→ = 카드 이동, Space = 선택.
	// 칸(slot)은 폭이 줄어 카드가 겹치고, 카드 자체는 크기를 유지한다.
	import { flip } from 'svelte/animate';
	import { draggable } from './drag.ts';
	import { CARD_PX, type CardId, type CardSize } from './cards.ts';
	import { receive, reflow, send } from './motion.svelte.ts';
	import PlayingCard from './PlayingCard.svelte';

	interface Props {
		cards: CardId[];
		selected: CardId[];
		size?: CardSize;
		ontoggle: (card: CardId) => void;
		ondoubletap?: (card: CardId) => void;
		/** 지금 끌어서 낼 수 있는지. */
		canDrag?: boolean;
		canDrop?: (card: CardId, zone: string) => boolean;
		ondrop?: (card: CardId, zone: string) => boolean;
		ondragchange?: (card: CardId | null) => void;
	}
	let {
		cards,
		selected,
		size = 'lg',
		ontoggle,
		ondoubletap,
		canDrag = false,
		canDrop,
		ondrop,
		ondragchange
	}: Props = $props();

	const DOUBLE_TAP_MS = 320;
	const px = $derived(CARD_PX[size]);
	let focusCard = $state<CardId | null>(null);
	let root = $state<HTMLElement>();
	let lastTap = { card: '', at: 0 };

	/** 탭 순서에 드는 카드는 하나다(roving tabindex). */
	const tabCard = $derived(focusCard && cards.includes(focusCard) ? focusCard : cards[0]);

	function tap(card: CardId, e: MouseEvent) {
		const now = performance.now();
		// 키보드 Enter/Space의 click은 detail이 0이다: 두 번 탭으로 치지 않는다
		if (e.detail > 0 && ondoubletap && lastTap.card === card && now - lastTap.at < DOUBLE_TAP_MS) {
			lastTap = { card: '', at: 0 };
			ondoubletap(card);
			return;
		}
		lastTap = { card, at: now };
		ontoggle(card);
	}

	function focusAt(index: number) {
		const card = cards[(index + cards.length) % cards.length];
		focusCard = card;
		root?.querySelector<HTMLElement>(`[data-card="${card}"]`)?.focus();
	}

	function keydown(e: KeyboardEvent) {
		const at = cards.indexOf((e.target as HTMLElement).dataset.card ?? '');
		if (at < 0) return;
		const next: Record<string, number> = {
			ArrowLeft: at - 1,
			ArrowRight: at + 1,
			Home: 0,
			End: cards.length - 1
		};
		if (e.key in next) {
			e.preventDefault();
			focusAt(next[e.key]);
		}
	}

	/** 부채꼴: 가운데에서 멀수록 살짝 눕고 내려간다. */
	function fan(i: number, n: number) {
		const off = i - (n - 1) / 2;
		return `--angle:${(off * 1.4).toFixed(2)}deg;--arc:${(off * off * 0.7).toFixed(2)}px`;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	class="hand"
	role="group"
	aria-label={`내 손패 ${cards.length}장`}
	style={`--w:${px.w}px;--h:${px.h}px`}
	data-testid="hand"
	onkeydown={keydown}
>
	{#each cards as card, i (card)}
		<div
			class="slot"
			in:receive={{ key: card }}
			out:send={{ key: card }}
			animate:flip={reflow()}
			style={fan(i, cards.length)}
		>
			<div
				class="drag"
				use:draggable={{
					enabled: canDrag,
					canDrop: (zone) => canDrop?.(card, zone) ?? false,
					onDrop: (zone) => ondrop?.(card, zone) ?? false,
					onStart: () => ondragchange?.(card),
					onEnd: () => ondragchange?.(null)
				}}
			>
				<div class={['tilt', selected.includes(card) && 'lifted']}>
					<PlayingCard
						{card}
						{size}
						raised
						selected={selected.includes(card)}
						tabindex={card === tabCard ? 0 : -1}
						onclick={(e) => tap(card, e)}
					/>
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	.hand {
		display: flex;
		justify-content: center;
		/* 고른 카드가 올라올 자리와 부채꼴로 내려갈 자리 */
		padding: 16px 0 12px;
		min-height: calc(var(--h) + 28px);
	}
	.slot {
		position: relative;
		flex: 0 1 var(--w);
		min-width: 0;
		height: var(--h);
	}
	.slot:last-child {
		flex-shrink: 0;
	}
	.slot:focus-within {
		z-index: 2;
	}
	.drag {
		position: relative;
		width: var(--w);
		height: var(--h);
	}
	:global(.drag.dragging) {
		z-index: 70;
		will-change: transform;
		cursor: grabbing;
	}
	.tilt {
		--lift: 0px;
		transform: translateY(calc(var(--arc) + var(--lift))) rotate(var(--angle));
		transition: transform var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.lifted {
		--lift: -14px;
	}
	@media (hover: hover) {
		.slot:hover .tilt:not(.lifted) {
			--lift: -6px;
		}
	}
</style>
