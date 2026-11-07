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
		/** 복기: 내 수와 추천을 카드 위에 표시한다. */
		marks?: Partial<Record<CardId, 'mine' | 'best'>>;
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
		marks,
		size = 'lg',
		ontoggle,
		ondoubletap,
		canDrag = false,
		canDrop,
		ondrop,
		ondragchange
	}: Props = $props();

	const DOUBLE_TAP_MS = 320;
	/** 받은 뒤의 최대 손패와 터치 영역 하한 (DESIGN_PLAN §4: 48dp). */
	const MAX_HAND = 8;
	const MIN_TAP = 48;
	/** 두 줄일 때 윗줄이 아랫줄에 가리는 높이. 윗줄 카드의 드러난 높이는 56px이다. */
	const ROW_OVERLAP = 20;

	let width = $state(0);
	/** 8장을 한 줄로 겹쳐 놓으면 드러난 폭이 48dp보다 좁아지는 폭에서는 항상 두 줄이다. */
	const twoRows = $derived(width > 0 && (width - CARD_PX[size].w) / (MAX_HAND - 1) < MIN_TAP);
	const cardSize = $derived<CardSize>(twoRows ? 'md' : size);
	const px = $derived(CARD_PX[cardSize]);
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

	/** 부채꼴: 가운데에서 멀수록 살짝 눕고 내려간다. */
	function fan(i: number, n: number) {
		if (twoRows) return '--angle:0deg;--arc:0px';
		const off = i - (n - 1) / 2;
		return `--angle:${(off * 1.4).toFixed(2)}deg;--arc:${(off * off * 0.7).toFixed(2)}px`;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	bind:clientWidth={width}
	class={['hand', twoRows && 'rows']}
	role="group"
	aria-label={`내 손패 ${cards.length}장`}
	style={`--w:${px.w}px;--h:${px.h}px;--columns:${columns};--overlap:${ROW_OVERLAP}px`}
	data-testid="hand"
	onkeydown={keydown}
>
	{#each cards as card, i (card)}
		<div
			class={['slot', twoRows && i >= columns && 'second']}
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
						size={cardSize}
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
	/* 휴대폰: 두 줄이라 카드가 옆으로 겹치지 않는다. 장수가 줄어도 높이는 그대로라 행동 바가 움직이지 않는다 */
	.rows {
		flex-wrap: wrap;
		align-content: flex-start;
		padding: 12px 0 6px;
		min-height: calc(var(--h) * 2 - var(--overlap) + 18px);
	}
	.rows .slot,
	.rows .slot:last-child {
		flex: 0 0 calc(100% / var(--columns));
		display: flex;
		justify-content: center;
	}
	.rows .second {
		margin-top: calc(var(--overlap) * -1);
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
