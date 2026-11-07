<script lang="ts">
	// 훈련 세션 화면: 진행 점 → 문제 → 피드백 → 요약. 세션을 시작할 때 불러온다.
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import DiscardQuestion from './DiscardQuestion.svelte';
	import { DRILLS } from './drills.ts';
	import FeedbackSheet from './FeedbackSheet.svelte';
	import MeldQuestion from './MeldQuestion.svelte';
	import NotebookQuestion from './NotebookQuestion.svelte';
	import StopQuestion from './StopQuestion.svelte';
	import ThankYouQuestion from './ThankYouQuestion.svelte';
	import { training } from './training.svelte.ts';

	const question = $derived(training.question);
	const summary = $derived(training.summary);
	const correct = $derived(training.results.filter((r) => r.ok).length);
	const done = $derived(training.results.length);
</script>

{#if summary}
	<section class="summary" data-testid="t-summary">
		<h2 data-testid="t-score">{summary.correct} / {summary.total}</h2>
		<p>
			정답률 {summary.total ? Math.round((summary.correct / summary.total) * 100) : 0}% · 평균 {summary.seconds.toFixed(
				1
			)}초
		</p>
		<ul>
			{#each summary.byDrill as row (row.type)}
				<li>
					<span><Icon name={DRILLS[row.type].icon} size={20} />{DRILLS[row.type].title}</span>
					<b>{row.ok} / {row.n}</b>
				</li>
			{/each}
		</ul>
		<div class="row">
			<Button variant="tonal" size="md" onclick={() => training.exit()} data-testid="t-home"
				>훈련 홈</Button
			>
			<Button
				size="md"
				icon="replay"
				data-testid="t-again"
				onclick={() => training.start(summary.kind)}>한 번 더</Button
			>
		</div>
	</section>
{:else}
	<div class={['stage', training.feedback && 'answered']}>
		<div class="progress" data-testid="t-progress">
			<ol aria-label={`${training.plan.length}문제 중 ${done}문제 풀었다, ${correct}문제 정답`}>
				{#each training.plan as _, i (i)}
					{@const r = training.results[i]}
					<li class={[r && (r.ok ? 'ok' : 'bad'), !r && i === done && 'now']}></li>
				{/each}
			</ol>
			{#if question?.retry}<span class="retry" data-testid="t-retry">다시 풀기</span>{/if}
			<span class="score" data-testid="t-tally">
				{correct} / {done}{training.retriesLeft ? ` · 다시 ${training.retriesLeft}` : ''}
			</span>
		</div>

		{#if training.error}
			<p class="error" role="alert">문제를 만들지 못했다: {training.error}</p>
			<Button size="md" data-testid="t-next" onclick={() => training.next()}>다음 문제</Button>
		{:else if question}
			<div class="question" data-testid="t-question" data-drill={question.type}>
				{#key question.id}
					{#if question.type === 'meld' && question.puzzle.type === 'meld'}
						<MeldQuestion puzzle={question.puzzle} />
					{:else if question.type === 'thankyou' && question.puzzle.type === 'thankyou'}
						<ThankYouQuestion puzzle={question.puzzle} />
					{:else if question.type === 'stop' && question.puzzle.type === 'stop'}
						<StopQuestion puzzle={question.puzzle} />
					{:else if question.type === 'discard' && question.puzzle.type === 'discard'}
						<DiscardQuestion puzzle={question.puzzle} />
					{:else if question.type === 'notebook'}
						<NotebookQuestion puzzle={question.puzzle} />
					{/if}
				{/key}
			</div>
		{:else}
			<div class="loading" data-testid="t-loading">
				<Progress label="문제 만드는 중" />
				<p>문제 만드는 중…</p>
			</div>
		{/if}
	</div>
	{#if training.feedback}
		{#key training.feedback}
			<FeedbackSheet feedback={training.feedback} />
		{/key}
	{/if}
{/if}

<style>
	.stage {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 720px;
		margin: 0 auto;
		/* 고정 행동 바 높이만큼 비워 손패가 가리지 않게 한다 */
		padding: 0 8px 88px;
	}
	/* 피드백 시트가 올라와도 장면 전체를 스크롤해 볼 수 있다 */
	.answered {
		padding-bottom: 60dvh;
	}
	.progress {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	ol {
		display: flex;
		flex: 1;
		gap: 3px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		list-style: none;
	}
	ol li {
		flex: 1;
		height: 6px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface-container-highest);
	}
	ol li.now {
		background: var(--md-sys-color-outline);
	}
	ol li.ok {
		background: var(--md-sys-color-primary);
	}
	ol li.bad {
		background: var(--md-sys-color-error);
	}
	.score {
		flex: none;
		font-size: var(--md-sys-typescale-label-medium-size);
		font-variant-numeric: tabular-nums;
		color: var(--md-sys-color-on-surface-variant);
	}
	.question {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.retry {
		flex: none;
		padding: 2px 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
		font-size: var(--md-sys-typescale-label-medium-size);
	}
	.loading {
		display: grid;
		gap: 8px;
		padding: 32px 16px;
		text-align: center;
	}
	.loading p,
	.error {
		margin: 0;
	}
	.error {
		color: var(--md-sys-color-error);
	}
	.summary {
		display: grid;
		gap: 12px;
		max-width: 480px;
		margin: 0 auto;
		padding: 24px 16px;
		text-align: center;
	}
	.summary h2 {
		margin: 0;
		font-size: var(--md-sys-typescale-display-medium-size);
		line-height: var(--md-sys-typescale-display-medium-line-height);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.summary p {
		margin: 0;
		color: var(--md-sys-color-on-surface-variant);
	}
	.summary ul {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
	}
	.summary li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-radius: var(--md-sys-shape-corner-medium);
		background: var(--md-sys-color-surface-container);
	}
	.summary li span {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
</style>
