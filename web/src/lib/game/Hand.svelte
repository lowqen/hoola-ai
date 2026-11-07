<script lang="ts">
	// 내 손패. 탭 = 선택, 두 번 탭 = 버리기, 끌기 = 놓은 곳에 내기, ←/→ = 카드 이동, Space = 선택.
	// 칸(slot)은 폭이 줄어 카드가 겹치고, 카드 자체는 크기를 유지한다.
	import { flip } from 'svelte/animate';
	import { draggable } from './drag.ts';
	import type { CardId } from './cards.ts';
	import { receive, reflow, send } from './motion.svelte.ts';
	import PlayingCard from './PlayingCard.svelte';

	interface Props {
		cards: CardId[];
		selected: CardId[];
		/** 복기: 내 수와 추천을 카드 위에 표시한다. */
		marks?: Partial<Record<CardId, 'mine' | 'best'>>;
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
		marks,
		ontoggle,
		ondoubletap,
		canDrag = false,
		canDrop,
		ondrop,
		ondragchange
	}: Props = $props();

	const DOUBLE_TAP_MS = 320;
	const columns = $derived(Math.max(4, Math.ceil(cards.length / 2)));
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

	/** 부채꼴: 가운데에서 멀수록 살짝 눕고 내려간다. 두 줄 배치에서는 CSS가 무시한다. */
	function fan(i: number, n: number) {
		const off = i - (n - 1) / 2;
		return `--angle:${(off * 1.4).toFixed(2)}deg;--arc:${(off * off * 0.7).toFixed(2)}px`;
	}
</script>

<div class="fit">
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={root}
		class="hand"
		role="group"
		aria-label={`내 손패 ${cards.length}장`}
		style={`--columns:${columns}`}
		data-testid="hand"
		onkeydown={keydown}
	>
		{#each cards as card, i (card)}
			<div
				class={['slot', i >= columns && 'second']}
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
							size="inherit"
							raised
							mark={marks?.[card]}
							selected={selected.includes(card)}
							tabindex={card === tabCard ? 0 : -1}
							onclick={(e) => tap(card, e)}
						/>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	/* 배치는 CSS 컨테이너 쿼리로 정한다: 프리렌더 HTML이 처음부터 맞게 그려져 수화 때 레이아웃이 밀리지 않는다 */
	.fit {
		container-type: inline-size;
	}
	.hand {
		/* lg 카드 (cards.ts CARD_PX) */
		--w: 64px;
		--h: 90px;
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
	/*
	 * 휴대폰: 받은 뒤 최대 8장을 한 줄로 겹치면 드러난 폭이 48dp(§4)보다 좁아지는 폭(64 + 7 × 48 = 400px)에서는 항상 두 줄이다.
	 * md 카드(54×76)로 옆으로 겹치지 않는다. 윗줄의 드러난 높이는 56px이고, 장수가 줄어도 높이가 그대로라 행동 바가 움직이지 않는다.
	 */
	@container (width < 400px) {
		.hand {
			--w: 54px;
			--h: 76px;
			--overlap: 20px;
			flex-wrap: wrap;
			align-content: flex-start;
			padding: 12px 0 6px;
			min-height: calc(var(--h) * 2 - var(--overlap) + 18px);
		}
		.slot,
		.slot:last-child {
			flex: 0 0 calc(100% / var(--columns));
			display: flex;
			justify-content: center;
		}
		.second {
			margin-top: calc(var(--overlap) * -1);
		}
		.tilt {
			transform: translateY(var(--lift));
		}
	}
</style>
