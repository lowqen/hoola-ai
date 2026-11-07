<script lang="ts">
	// 훈련 (DESIGN_PLAN §5.2): 홈은 오늘의 훈련과 유형 카드, 세션 화면은 처음 시작할 때 불러온다.
	import { onMount, type Component } from 'svelte';
	import { DRILLS, PUZZLE_KINDS, type DrillId } from '#lib/train/drills.ts';
	import { training } from '#lib/train/training.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Fab from '#lib/ui/Fab.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import TopAppBar from '#lib/ui/TopAppBar.svelte';

	let Stage = $state.raw<Component>();
	let stageRequested = false;
	$effect(() => {
		if (training.active && !stageRequested) {
			stageRequested = true;
			void import('#lib/train/Stage.svelte').then((m) => (Stage = m.default));
		}
	});

	onMount(() => {
		training.hydrate();
		// 대전 결과·기록·복기에서 유형을 골라 들어온다: /train/?drill=stop
		const drill = new URLSearchParams(location.search).get('drill');
		if (drill && drill in DRILLS) training.start(drill as DrillId);
	});

	const today = $derived(training.todayDone);
	const weakest = $derived(training.weakest);
	const current = $derived(training.question ? DRILLS[training.question.type] : null);

	function meta(type: DrillId) {
		const stat = training.stats[type];
		const accuracy = training.recentAccuracy(type);
		if (!stat.n || accuracy === null) return '아직 안 풀어 봤다';
		return `최근 정답률 ${Math.round(accuracy * 100)}% · ${stat.n}문제 · 최고 연속 ${stat.best}`;
	}

	function keydown(e: KeyboardEvent) {
		if (!training.active || e.ctrlKey || e.metaKey || e.altKey) return;
		const target = e.target as HTMLElement;
		if (e.key === 'Escape') {
			training.exit();
		} else if (e.key === 'Enter') {
			// 버튼에 포커스가 있으면 그 버튼을 누른다. 카드는 Space로 고르므로 제출로 친다
			if (target.matches('button:not([data-card]), a')) return;
			e.preventDefault();
			if (training.feedback) void training.next();
			else if (training.question) training.submit?.();
		} else if (/^[1-9]$/.test(e.key) && !training.feedback) {
			training.choose?.(Number(e.key) - 1);
		}
	}
</script>

<svelte:head>
	<title>훈련 · 훌라 연습장</title>
	<meta name="description" content="훌라 조합 찾기·땡큐·스톱·버릴 카드 훈련" />
</svelte:head>

<svelte:window onkeydown={keydown} />

<TopAppBar title={current?.title ?? '훈련'} subtitle={current?.rule}>
	{#snippet actions()}
		{#if training.active}
			<IconButton
				icon="close"
				label="그만두기"
				data-testid="t-exit"
				onclick={() => training.exit()}
			/>
		{/if}
	{/snippet}
</TopAppBar>

{#if training.active}
	<main>
		{#if Stage}<Stage />{/if}
	</main>
{:else}
	<main class="home">
		<section class="hero" aria-labelledby="train-title">
			<h2 id="train-title">오늘의 훈련</h2>
			<p>자주 놓치는 판단을 짧은 문제로 반복한다. 문제는 엔진이 실제 판에서 만든다.</p>
			<p class="today" data-testid="t-today">
				{today.n
					? `오늘 ${today.n}문제 · 정답률 ${Math.round((today.correct / today.n) * 100)}%`
					: '오늘은 아직 안 풀었다'} · {weakest
					? `추천: ${DRILLS[weakest.type].title} (최근 정답률 ${Math.round(weakest.accuracy * 100)}%)`
					: '섞어 풀기로 고르게 연습하세요'}
			</p>
			<Fab icon="school" data-testid="t-start" onclick={() => training.start('mix')}
				>오늘의 훈련 10문제</Fab
			>
		</section>

		<ul class="drills" data-testid="t-drills">
			{#each PUZZLE_KINDS as type (type)}
				{@const accuracy = training.recentAccuracy(type)}
				<li>
					<Card
						variant="outlined"
						label={`${DRILLS[type].title} 훈련 시작`}
						onclick={() => training.start(type)}
					>
						<span class="drill" data-testid={`t-drill-${type}`}>
							<span class="title"
								><Icon name={DRILLS[type].icon} size={20} />{DRILLS[type].title}</span
							>
							<span class="rule">{DRILLS[type].rule}</span>
							<span class="meta">{meta(type)}</span>
							{#if accuracy !== null}
								<Progress value={accuracy} label={`${DRILLS[type].title} 최근 정답률`} />
							{/if}
						</span>
					</Card>
				</li>
			{/each}
			<li>
				{#if training.notebookCount}
					<Card
						variant="filled"
						label={`오답 노트 ${training.notebookCount}개 다시 풀기`}
						onclick={() => training.start('notebook')}
					>
						<span class="drill" data-testid="t-drill-notebook">
							<span class="title">
								<Icon name={DRILLS.notebook.icon} size={20} />{DRILLS.notebook.title}
								<Badge value={training.notebookCount} />
							</span>
							<span class="rule">{DRILLS.notebook.rule}</span>
							<span class="meta">{training.notebookCount}개 대기 · 두 번 맞히면 빠진다</span>
							{#if training.fromReviewCount}
								<span class="meta" data-testid="t-from-review"
									>복기에서 온 문제 {training.fromReviewCount}개</span
								>
							{/if}
						</span>
					</Card>
				{:else}
					<Card variant="filled">
						<span class="drill" data-testid="t-notebook-empty">
							<span class="title"
								><Icon name={DRILLS.notebook.icon} size={20} />{DRILLS.notebook.title}</span
							>
							<span class="rule">틀린 장면이 여기에 쌓인다. 아직 비어 있다.</span>
							<Button variant="tonal" onclick={() => training.start('mix')}>문제 풀러 가기</Button>
						</span>
					</Card>
				{/if}
			</li>
		</ul>
		<p class="note">
			약한 유형이 더 자주 나온다. 틀린 문제는 같은 훈련 안에서 3문제 뒤에 다시 나오고, 오답 노트에도
			쌓인다. Enter = 제출·다음, 숫자 = 보기 선택, Esc = 그만두기.
		</p>
	</main>
{/if}

<style>
	.home {
		display: grid;
		gap: 12px;
		max-width: 720px;
		margin: 0 auto;
		padding: 0 12px 24px;
	}
	.hero {
		display: grid;
		justify-items: start;
		gap: 8px;
		padding: 20px;
		border-radius: var(--md-sys-shape-corner-extra-large);
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	h2 {
		margin: 0;
		font-size: var(--md-sys-typescale-headline-small-size);
		line-height: var(--md-sys-typescale-headline-small-line-height);
		font-weight: 800;
	}
	.hero p {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	.today {
		min-height: 3em;
		font-weight: 600;
	}
	.drills {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.drills li {
		display: grid;
	}
	.drill {
		display: grid;
		gap: 6px;
		text-align: left;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 800;
	}
	.rule {
		font-size: var(--md-sys-typescale-body-small-size);
		line-height: var(--md-sys-typescale-body-small-line-height);
	}
	.meta,
	.note {
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-label-medium-size);
	}
	.note {
		margin: 0;
		line-height: 1.5;
	}
</style>
