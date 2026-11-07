<script lang="ts">
	// 판 종료 시트 (DESIGN_PLAN §6.3): 승패 → 끝난 이유 → 전원 손패 → 다음 행동.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlayingCard from '#lib/game/PlayingCard.svelte';
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { session } from './session.svelte.ts';

	const result = $derived(session.result);

	function practice(drill: string) {
		session.resultOpen = false;
		void goto(`${resolve('/(app)/train')}/?drill=${drill}`);
	}
</script>

<BottomSheet bind:open={session.resultOpen} label="판 결과">
	{#if result}
		<h2 class={result.tone} data-testid="result-title">{result.title}</h2>
		<p class="reason" data-testid="result-reason">{result.reason}</p>
		{#if result.cause}
			<p class="cause" data-testid="result-cause">{result.cause}</p>
			{#if result.drill}
				{@const drill = result.drill}
				<Button
					variant="text"
					size="sm"
					icon="school"
					data-testid="result-train"
					onclick={() => practice(drill)}>이 유형 훈련하기</Button
				>
			{/if}
		{/if}
		<ul class="hands" data-testid="result-hands">
			{#each result.hands as hand (hand.seat)}
				<li class={[hand.winner && 'winner']}>
					<span class="who">
						{#if hand.winner}<Icon name="check" size={16} />{/if}
						{hand.name}
					</span>
					<span class="cards">
						{#each hand.cards as card (card)}
							<PlayingCard {card} size="xs" />
						{:else}
							<span class="none">털었음</span>
						{/each}
					</span>
					<span class="points">{hand.points}점</span>
				</li>
			{/each}
		</ul>
		<div class="actions">
			<Button wide icon="history" data-testid="review" onclick={() => session.openReview()}
				>복기하기</Button
			>
			<div class="row">
				<Button
					wide
					variant="tonal"
					icon="replay"
					data-testid="same-game"
					onclick={() => session.sameGame()}>같은 패 다시</Button
				>
				<Button
					wide
					variant="outlined"
					icon="playing_cards"
					data-testid="next-game"
					onclick={() => session.newGame()}>새 판</Button
				>
			</div>
		</div>
	{/if}
</BottomSheet>

<style>
	h2 {
		margin: 0;
		font-size: var(--md-sys-typescale-display-small-size);
		line-height: var(--md-sys-typescale-display-small-line-height);
		font-weight: 800;
	}
	.win {
		color: var(--md-sys-color-primary);
	}
	.lose {
		color: var(--md-sys-color-error);
	}
	.reason {
		margin: 4px 0 0;
		font-size: var(--md-sys-typescale-title-small-size);
	}
	.cause {
		margin: 8px 0 0;
		padding: 8px 12px;
		border-radius: var(--md-sys-shape-corner-medium);
		background: var(--md-sys-color-surface-container-high);
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.hands {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 16px 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: 76px minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--md-sys-typescale-label-large-size);
	}
	.winner .who,
	.winner .points {
		font-weight: 800;
		color: var(--md-sys-color-primary);
	}
	.cards {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}
	.none {
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-small-size);
	}
	.points {
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
</style>
