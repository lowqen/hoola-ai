<script lang="ts">
	// 게임 장면: 대전·훈련·복기가 함께 쓴다. 규칙은 모른다: 무엇을 어디에 낼 수 있는지는 dropTargets가 정한다.
	// 위쪽은 보는 정보, 아래 1/3은 조작이다 (DESIGN_PLAN §6.1-2).
	// 비행 카드가 다른 영역 위로 지나가도록 이 안의 영역들은 쌓임 맥락을 만들지 않는다.
	import type { Snippet } from 'svelte';
	import { handPoints, type CardId } from './cards.ts';
	import GhostLayer from './GhostLayer.svelte';
	import Hand from './Hand.svelte';
	import MeldGroup, { type MeldInfo } from './MeldGroup.svelte';
	import Pile from './Pile.svelte';
	import Seat, { type SeatInfo } from './Seat.svelte';

	interface Props {
		seats: SeatInfo[];
		/** 지금 차례인 좌석 id. 내 차례면 'me'. */
		turn: number | 'me';
		stockCount: number;
		discard: CardId[];
		melds: MeldInfo[];
		hand: CardId[];
		selected: CardId[];
		/** 카드 한 장을 낼 수 있는 구역 ('discard', 'meld-3'). */
		dropTargets?: (card: CardId) => string[];
		ontoggle: (card: CardId) => void;
		/** 낸다. 실제로 냈으면 true. */
		onplay?: (card: CardId, zone: string) => boolean;
		/** 더미를 눌러 받기. 지금 받을 수 있을 때만 준다. */
		ondraw?: () => void;
		/** 라이브 영역 알림 ("상대가 다이아 K를 버렸다"). */
		announcement?: string;
		actions?: Snippet;
	}
	let {
		seats,
		turn,
		stockCount,
		discard,
		melds,
		hand,
		selected,
		dropTargets = () => [],
		ontoggle,
		onplay,
		ondraw,
		announcement = '',
		actions
	}: Props = $props();

	let dragging = $state<CardId | null>(null);
	const playing = $derived(dragging ?? (selected.length === 1 ? selected[0] : null));
	const targets = $derived(playing ? dropTargets(playing) : []);
	const score = $derived(handPoints(hand));
	const myTurn = $derived(turn === 'me');

	function play(zone: string) {
		if (playing) onplay?.(playing, zone);
	}
</script>

<section class="scene" aria-label="게임 장면">
	<div class="seats">
		{#each seats as seat (seat.id)}
			<Seat {seat} active={turn === seat.id} />
		{/each}
	</div>

	<div class="felt">
		<div class="piles">
			<Pile kind="stock" count={stockCount} active={!!ondraw} onclick={ondraw} />
			<Pile
				kind="discard"
				cards={discard}
				target={targets.includes('discard')}
				onclick={() => play('discard')}
			/>
		</div>
		<div class="melds" data-testid="melds">
			{#each melds as meld (meld.id)}
				<MeldGroup
					{meld}
					target={targets.includes(`meld-${meld.id}`)}
					onattach={() => play(`meld-${meld.id}`)}
				/>
			{:else}
				<p class="no-melds">아직 등록한 조합이 없다</p>
			{/each}
		</div>
	</div>

	<div class="mine">
		<div class="status">
			<span class={['turn', myTurn && 'on']} data-testid="turn">
				{myTurn ? '내 차례' : '상대 차례'}
			</span>
			<span class="score"
				><span class="value" data-testid="score">{score}</span><span class="unit">점</span></span
			>
		</div>
		<Hand
			cards={hand}
			{selected}
			{ontoggle}
			canDrag={myTurn && !!onplay}
			canDrop={(card, zone) => dropTargets(card).includes(zone)}
			ondrop={(card, zone) => onplay?.(card, zone) ?? false}
			ondoubletap={(card) => {
				if (dropTargets(card).includes('discard')) onplay?.(card, 'discard');
			}}
			ondragchange={(card) => (dragging = card)}
		/>
	</div>

	{@render actions?.()}

	<p class="visually-hidden" role="status" data-testid="announcement">{announcement}</p>
</section>
<GhostLayer />

<style>
	.scene {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.seats {
		display: flex;
		gap: 8px;
	}
	.felt {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 16px;
		min-height: 148px;
		padding: 12px;
		border-radius: var(--md-sys-shape-corner-large);
		background: linear-gradient(160deg, var(--hoola-color-felt-1), var(--hoola-color-felt-2));
		color: var(--hoola-color-on-felt);
	}
	.piles {
		display: flex;
		flex: none;
		gap: 16px;
	}
	.melds {
		display: flex;
		flex: 1 1 200px;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 12px;
		min-width: 0;
	}
	.no-melds {
		margin: 0;
		font-size: var(--md-sys-typescale-body-small-size);
		color: var(--hoola-color-on-felt-variant);
	}
	.mine {
		padding: 8px 12px 0;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-surface-container-low);
	}
	.status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.turn {
		padding: 2px 12px;
		border-radius: var(--md-sys-shape-corner-full);
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 700;
		color: var(--md-sys-color-on-surface-variant);
	}
	.turn.on {
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
	}
	.value {
		font-size: var(--md-sys-typescale-headline-large-size);
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.unit {
		margin-left: 2px;
		font-size: var(--md-sys-typescale-label-large-size);
		color: var(--md-sys-color-on-surface-variant);
	}
</style>
