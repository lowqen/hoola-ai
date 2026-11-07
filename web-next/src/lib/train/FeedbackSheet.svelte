<script lang="ts">
	// 피드백 시트 (DESIGN_PLAN §5.2): 아래에서 올라온다. 정답은 짧은 스프링 바운스로 보상한다.
	// 장면을 계속 볼 수 있도록 모달이 아니다.
	import { onMount } from 'svelte';
	import { cardText, handPoints, sortCards } from '#lib/game/cards.ts';
	import PlayingCard from '#lib/game/PlayingCard.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Dock from './Dock.svelte';
	import MoveBars from './MoveBars.svelte';
	import { training, type Feedback } from './training.svelte.ts';

	let { feedback }: { feedback: Feedback } = $props();

	let next = $state<HTMLElement>();
	onMount(() => next?.querySelector('button')?.focus());
</script>

<Dock>
	<section
		class={['sheet', feedback.ok ? 'ok' : 'bad']}
		aria-label="채점 결과"
		data-testid="feedback"
		data-ok={feedback.ok}
	>
		<div class="scroll">
			<h2 role="status">
				<Icon name={feedback.ok ? 'check' : 'close'} />
				{feedback.ok ? '정답' : '오답'} · {feedback.title}
			</h2>
			<ul class="lines">
				{#each feedback.lines as line, i (i)}<li>{line}</li>{/each}
			</ul>

			{#if feedback.bestMelds}
				<h3>최선의 묶음</h3>
				<div class="melds">
					{#each feedback.bestMelds as meld (meld.join())}
						<div class="meld" data-testid="best-meld" data-cards={meld.join(' ')}>
							{#each sortCards(meld) as card (card)}<PlayingCard {card} size="xs" />{/each}
							<span>{handPoints(meld)}점</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if feedback.rule}
				<h3>규칙 점수 (점수 − 살릴 카드 수 × 3)</h3>
				<ul class="rule" data-testid="rule-table">
					{#each feedback.rule as row (row.card)}
						<li class={[row.mine && 'mine', row.best && 'best']}>
							<span class="card">{cardText(row.card)}</span>
							<span>{row.points}점 − {row.outs}×3 = {row.score}</span>
							{#if row.mine}<b>내 답</b>{/if}
							{#if row.best}<b>최선</b>{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if feedback.bars}
				<h3>시뮬레이션 추정 승률</h3>
				<MoveBars bars={feedback.bars} />
			{/if}
		</div>
		<div class="foot" bind:this={next}>
			<span class="time">{feedback.seconds.toFixed(1)}초</span>
			<Button
				size="md"
				trailingIcon="arrow_forward"
				data-testid="t-next"
				onclick={() => training.next()}>다음 문제</Button
			>
		</div>
	</section>
</Dock>

<style>
	.sheet {
		display: flex;
		flex-direction: column;
		max-height: 60dvh;
		border-radius: var(--md-sys-shape-corner-extra-large) var(--md-sys-shape-corner-extra-large) 0 0;
		box-shadow: var(--md-sys-elevation-level3);
		animation: rise var(--md-sys-motion-spring-standard-spatial-default-duration)
			var(--md-sys-motion-spring-standard-spatial-default);
	}
	.ok {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		animation: bounce var(--md-sys-motion-spring-expressive-spatial-default-duration)
			var(--md-sys-motion-spring-expressive-spatial-default);
	}
	.bad {
		background: var(--md-sys-color-error-container);
		color: var(--md-sys-color-on-error-container);
	}
	.scroll {
		overflow-y: auto;
		padding: 16px 16px 4px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: var(--md-sys-typescale-title-medium-size);
		font-weight: 800;
	}
	h3 {
		margin: 12px 0 6px;
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: 700;
	}
	.lines {
		margin: 8px 0 0;
		padding-left: 18px;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	.melds {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.meld {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--md-sys-typescale-label-medium-size);
		font-weight: 700;
	}
	.meld span {
		margin-left: 4px;
	}
	.rule {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--md-sys-typescale-body-small-size);
	}
	.rule li {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.card {
		min-width: 36px;
		font-weight: 700;
	}
	.rule b {
		padding: 0 6px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		font-size: var(--md-sys-typescale-label-small-size);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 16px 12px;
	}
	.time {
		font-size: var(--md-sys-typescale-label-large-size);
		font-variant-numeric: tabular-nums;
	}
	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}
	@keyframes bounce {
		from {
			transform: translateY(100%);
		}
	}
</style>
