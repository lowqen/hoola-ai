<script lang="ts">
	// 판 복기 (DESIGN_PLAN §5.3): 전체 화면 대화상자. 요약 → 승률 흐름 → 가장 큰 실수 상세 → 결정 목록.
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { CardId } from '#lib/game/cards.ts';
	import { actionText, parseAction } from '#lib/play/actions.ts';
	import { session } from '#lib/play/session.svelte.ts';
	import MoveBars from '#lib/train/MoveBars.svelte';
	import TrainScene from '#lib/train/TrainScene.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import { REVIEW_K } from './analysis.ts';
	import { CATEGORY, DRILL_OF } from './categories.ts';
	import { review } from './review.svelte.ts';
	import WinChart from './WinChart.svelte';

	const items = $derived(review.items);
	const item = $derived(items[review.selected]);
	const summary = $derived(review.summary);
	const name = $derived(review.seatName);
	const drill = $derived(item && item.loss > 0 ? DRILL_OF[item.category] : undefined);
	const mistakes = $derived(items.flatMap((it, i) => (it.loss > 0 ? [i] : [])));
	const previous = $derived(mistakes.filter((i) => i < review.selected).at(-1));
	const next = $derived(mistakes.find((i) => i > review.selected));

	const marks = $derived.by(() => {
		if (!item) return {};
		const out: Partial<Record<CardId, 'mine' | 'best'>> = {};
		for (const card of parseAction(item.mine.action).cards) out[card] = 'mine';
		for (const card of parseAction(item.best.action).cards) out[card] = 'best';
		return out;
	});

	let detail = $state<HTMLElement>();

	$effect(() => {
		if (!session.reviewOpen) return;
		untrack(() => {
			const ctx = session.reviewContext();
			if (ctx) review.open(ctx, (done, found) => session.saveReview(done, found));
		});
	});

	function select(index: number) {
		review.selected = index;
		// 한 단 화면에서는 상세가 목록과 떨어져 있어 위로 올려 준다
		if (matchMedia('(max-width: 839px)').matches) detail?.scrollIntoView({ block: 'start' });
	}

	function close() {
		review.close();
		session.closeReview();
	}

	function practice() {
		if (!drill) return;
		session.reviewOpen = false;
		void goto(`${resolve('/(app)/train')}/?drill=${drill}`);
	}

	const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
</script>

<Dialog bind:open={session.reviewOpen} fullscreen headline="판 복기" onclose={close}>
	<div class="review" data-testid="review-view">
		{#if review.status === 'running'}
			<div class="progress" data-testid="review-progress">
				<Progress value={review.total ? review.done / review.total : 0} label="복기 분석 진행률" />
				<p>분석 중… {review.done} / {review.total}</p>
			</div>
		{:else if review.status === 'error'}
			<p class="note" role="alert">분석 실패: {review.error}</p>
		{:else if review.status === 'empty'}
			<p class="note" data-testid="review-empty">복기할 내 결정이 없다.</p>
		{:else if summary && item}
			<div class="stats" data-testid="review-summary">
				<div><b>{summary.decisions}</b><span>결정</span></div>
				<div>
					<b>{Math.round((summary.accurate / summary.decisions) * 100)}%</b><span>정확도</span>
				</div>
				<div><b>{(summary.loss * 100).toFixed(1)}%p</b><span>확실한 손실 합</span></div>
				<div>
					<b>{summary.counts.blunder} · {summary.counts.mistake} · {summary.counts.inaccuracy}</b>
					<span>블런더 · 실수 · 부정확</span>
				</div>
			</div>

			<WinChart {items} players={session.reviewPlayers} onselect={select} />

			<div class="body">
				<article class="detail" bind:this={detail} data-testid="review-detail">
					<div class="head">
						<span class={`grade ${item.grade.id}`} data-testid="review-grade">
							<Icon name={item.grade.icon} size={16} />{item.grade.label}
						</span>
						<span class="muted"
							>{item.n}번째 결정{item.obs.turn === undefined ? '' : ` · ${item.obs.turn}턴`}</span
						>
						{#if item.loss > 0}
							<b class="loss" data-testid="review-loss">승률 −{(item.loss * 100).toFixed(1)}%p</b>
						{/if}
					</div>

					<div class="compare">
						<div class="mine">
							<span>내 수</span>
							<b>{actionText(item.mine.action, item.obs, name)}</b>
							<span>{pct(item.mine.value)}</span>
						</div>
						<div class="best">
							<span>추천</span>
							<b>{actionText(item.best.action, item.obs, name)}</b>
							<span>{pct(item.best.value)}</span>
						</div>
					</div>

					{#if item.loss > 0}
						<div class="why" data-testid="review-why">
							<h3>왜? · {CATEGORY[item.category]}</h3>
							<ul>
								{#each item.lines as line, i (i)}<li>{line}</li>{/each}
							</ul>
						</div>
					{:else if item.grade.id === 'table'}
						<div class="why">
							{#each item.lines as line, i (i)}<p>{line}</p>{/each}
						</div>
					{:else}
						<p class="why">
							{item.grade.id === 'best'
								? '최선의 수였다.'
								: '추천 수와 확실한 차이가 없다. 사실상 같은 수다.'}
						</p>
					{/if}

					<div class="actions">
						{#if drill}
							<Button icon="school" data-testid="review-train" onclick={practice}
								>이 실수 훈련하기</Button
							>
						{/if}
						<Button
							variant="tonal"
							icon="replay"
							data-testid="review-replay"
							onclick={() => session.replayFrom(item.decision.index)}>이 장면부터 다시 두기</Button
						>
					</div>

					<!-- 닫힌 뒤에도 남아 있으면 대전 장면과 같은 카드가 겹친다 -->
					{#if session.reviewOpen}
						{#key item.decision.index}
							<TrainScene obs={item.obs} {name} {marks} />
						{/key}
					{/if}

					<h3>다른 수와 비교 (추정 승률)</h3>
					<MoveBars
						mineLabel="내 수"
						bestLabel="추천"
						bars={item.scored.slice(0, 5).map((v, i) => ({
							text: actionText(v.action, item.obs, name),
							percent: v.value * 100,
							mine: v.action === item.mine.action,
							best: i === 0
						}))}
					/>

					<div class="nav">
						<Button
							variant="outlined"
							icon="arrow_back"
							disabled={previous === undefined}
							data-testid="review-prev"
							onclick={() => previous !== undefined && select(previous)}>이전 실수</Button
						>
						<Button
							variant="outlined"
							trailingIcon="arrow_forward"
							disabled={next === undefined}
							data-testid="review-next"
							onclick={() => next !== undefined && select(next)}>다음 실수</Button
						>
					</div>
					<p class="muted small">
						추정치: 숨은 패 {REVIEW_K}가지 × 수마다 끝까지 시뮬레이션. 손실은 같은 시뮬레이션끼리
						비교해 95% 확실한 차이만 센다.
					</p>
				</article>

				<ol class="list" aria-label="결정 목록" data-testid="review-list">
					{#each items as row, i (row.decision.index)}
						<li>
							<button
								type="button"
								class={[i === review.selected && 'active']}
								aria-current={i === review.selected}
								onclick={() => select(i)}
							>
								<span class={`grade ${row.grade.id}`}
									><Icon name={row.grade.icon} size={16} />{row.grade.label}</span
								>
								<span class="text">{actionText(row.mine.action, row.obs, name)}</span>
								{#if row.loss > 0}<b class="loss">−{(row.loss * 100).toFixed(1)}</b>{/if}
							</button>
						</li>
					{/each}
				</ol>
			</div>
		{/if}
	</div>
</Dialog>

<style>
	.review {
		display: grid;
		gap: 12px;
		max-width: 1080px;
		margin: 0 auto;
	}
	.progress {
		display: grid;
		gap: 8px;
		padding: 32px 0;
		text-align: center;
	}
	.progress p,
	.note {
		margin: 0;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.stats div {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border-radius: var(--md-sys-shape-corner-medium);
		background: var(--md-sys-color-surface-container);
	}
	.stats b {
		font-size: var(--md-sys-typescale-title-medium-size);
		font-variant-numeric: tabular-nums;
	}
	.stats span {
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-label-small-size);
	}
	.body {
		display: grid;
		gap: 16px;
	}
	.detail {
		display: grid;
		gap: 10px;
		min-width: 0;
		scroll-margin-top: 8px;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.grade {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface-container-highest);
		color: var(--md-sys-color-on-surface);
		font-size: var(--md-sys-typescale-label-medium-size);
		font-weight: 700;
	}
	.grade.best,
	.grade.good {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	.grade.mistake {
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
	}
	.grade.blunder {
		background: var(--md-sys-color-error-container);
		color: var(--md-sys-color-on-error-container);
	}
	.muted {
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-small-size);
	}
	.small {
		margin: 0;
		line-height: 1.5;
	}
	.loss {
		color: var(--md-sys-color-error);
		font-size: var(--md-sys-typescale-label-large-size);
		font-variant-numeric: tabular-nums;
	}
	.compare {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.compare div {
		display: grid;
		align-content: start;
		gap: 2px;
		padding: 10px 12px;
		border-radius: var(--md-sys-shape-corner-medium);
		font-size: var(--md-sys-typescale-body-small-size);
	}
	.compare b {
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.mine {
		background: var(--md-sys-color-error-container);
		color: var(--md-sys-color-on-error-container);
	}
	.best {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	h3 {
		margin: 0;
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 700;
	}
	.why {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	.why ul {
		margin: 4px 0 0;
		padding-left: 18px;
	}
	.why p {
		margin: 0 0 4px;
	}
	.actions,
	.nav {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 8px;
	}
	.list {
		display: grid;
		align-content: start;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list button {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 48px;
		padding: 4px 8px;
		border: 0;
		border-radius: var(--md-sys-shape-corner-small);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--md-sys-typescale-body-small-size);
		text-align: left;
		cursor: pointer;
	}
	.list button:hover {
		background: var(--md-sys-color-surface-container);
	}
	.list button.active {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.text {
		overflow: hidden;
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	@media (min-width: 600px) {
		.stats {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (min-width: 840px) {
		.body {
			grid-template-columns: 300px minmax(0, 1fr);
			align-items: start;
		}
		.list {
			grid-row: 1;
			grid-column: 1;
		}
		.detail {
			grid-column: 2;
		}
	}
</style>
