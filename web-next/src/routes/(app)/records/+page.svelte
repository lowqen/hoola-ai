<script lang="ts">
	// 기록 (DESIGN_PLAN §5.4): 상대 구성별 승률, 복기로 본 약점, 훈련 일별 기록.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { groupStats, trainingDays, weakness, type DayStat } from '#lib/records/stats.ts';
	import { loadStore, type Store } from '#lib/store.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import TopAppBar from '#lib/ui/TopAppBar.svelte';

	let store = $state.raw<Store | null>(null);
	onMount(() => {
		store = loadStore();
	});

	const stats = $derived(store ? groupStats(store.games) : null);
	const weak = $derived(store ? weakness(store.games) : null);
	const maxWeak = $derived(Math.max(1, ...(weak?.rows.map((r) => r.count) ?? [])));
	const days = $derived(store ? trainingDays(store.trainDays) : []);
	const maxDay = $derived(Math.max(1, ...days.map((d) => d.n)));
	const totalSolved = $derived(days.reduce((sum, d) => sum + d.n, 0));
	const totalCorrect = $derived(days.reduce((sum, d) => sum + d.correct, 0));

	let hovered = $state<DayStat | null>(null);
	/** 가리킨 날이 없으면 가장 최근에 푼 날을 보여 준다. */
	const shown = $derived(hovered ?? days.findLast((d) => d.n > 0) ?? null);

	const percent = (x: number) => `${Math.round(x * 100)}%`;
	const dayText = (d: DayStat) =>
		d.n ? `${d.label} · ${d.n}문제 · 정답률 ${percent(d.correct / d.n)}` : `${d.label} · 안 풀었다`;

	function exportGames() {
		const blob = new Blob(
			[JSON.stringify({ format: 'hoola-practice-1', games: store?.games ?? [] }, null, 2)],
			{ type: 'application/json' }
		);
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `hoola-games-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	}
</script>

<svelte:head>
	<title>기록 · 훌라 연습장</title>
	<meta name="description" content="훌라 전적과 복기로 본 약점, 훈련 기록" />
</svelte:head>

<TopAppBar title="기록">
	{#snippet actions()}
		{#if store?.games.length}
			<IconButton
				icon="download"
				label="전적 내보내기"
				data-testid="rec-export"
				onclick={exportGames}
			/>
		{/if}
	{/snippet}
</TopAppBar>

<main>
	{#if store && stats}
		<section aria-labelledby="rec-games">
			<h2 id="rec-games">상대 구성별 승률</h2>
			{#if stats.groups.length}
				<ul class="groups" data-testid="rec-groups">
					{#each stats.groups as group (group.label)}
						<li>
							<div class="row">
								<span class="name">{group.label}</span>
								<span class="value"><b>{percent(group.rate)}</b> {group.games}판</span>
							</div>
							<div
								class="track"
								role="img"
								aria-label={`승률 ${percent(group.rate)}, 공평한 몫 ${percent(group.fair)}`}
							>
								<span class="fill" style={`width:${Math.min(100, group.rate * 100)}%`}></span>
								<span class="fair" style={`left:${group.fair * 100}%`}></span>
							</div>
							<span class="meta">세로 눈금 = 공평한 몫 {percent(group.fair)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="empty" data-testid="rec-empty">
					<p>
						{stats.practice
							? `되돌리기를 쓴 연습판 ${stats.practice}판만 있다 (전적 제외). 끝까지 둔 판이 쌓이면 승률이 보인다.`
							: '아직 끝낸 판이 없다. 한 판을 끝내면 상대 구성별 승률이 쌓인다.'}
					</p>
					<Button
						icon="playing_cards"
						data-testid="rec-first-game"
						onclick={() => goto(resolve('/(app)'))}>첫 판 시작</Button
					>
				</div>
			{/if}
			{#if stats.groups.length && stats.practice}
				<p class="meta" data-testid="rec-practice">
					되돌리기·다시 두기를 쓴 연습판 {stats.practice}판은 승률에서 뺐다.
				</p>
			{/if}
		</section>

		<section aria-labelledby="rec-weak">
			<h2 id="rec-weak">복기로 본 약점</h2>
			{#if weak}
				<p class="summary" data-testid="rec-weak-summary">
					복기 {weak.reviewed}판 · 정확도 {percent(weak.accuracy)} · 판당 손실 {(
						weak.lossPerGame * 100
					).toFixed(1)}%p
				</p>
				{#if weak.rows.length}
					<ul class="weak">
						{#each weak.rows as row (row.category)}
							<li>
								{#snippet content()}
									<span class="label">{row.label}</span>
									<span class="bar"
										><span style={`width:${(row.count / maxWeak) * 100}%`}></span></span
									>
									<b>{row.count}</b>
									{#if row.drill}<Icon name="arrow_forward" size={18} />{/if}
								{/snippet}
								{#if row.drill}
									<a
										href={`${resolve('/(app)/train')}/?drill=${row.drill}`}
										class="weak-row"
										aria-label={`${row.label} 실수 ${row.count}번. 이 유형 훈련하기`}
										data-testid={`rec-weak-${row.category}`}
									>
										{@render content()}
									</a>
								{:else}
									<div class="weak-row" data-testid={`rec-weak-${row.category}`}>
										{@render content()}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="meta">확실한 실수가 아직 없다.</p>
				{/if}
			{:else}
				<p class="meta" data-testid="rec-weak-empty">
					판이 끝나면 결과 시트에서 복기하세요. 실수 유형이 여기에 쌓인다.
				</p>
			{/if}
		</section>

		<section aria-labelledby="rec-days">
			<h2 id="rec-days">최근 14일 훈련</h2>
			{#if totalSolved}
				<p class="summary" data-testid="rec-days-summary">
					{totalSolved}문제 · 정답률 {percent(totalCorrect / totalSolved)}
				</p>
				<ol class="days" data-testid="rec-days-chart" onpointerleave={() => (hovered = null)}>
					{#each days as day (day.date)}
						<li>
							<button
								type="button"
								aria-label={dayText(day)}
								data-testid={`rec-day-${day.date}`}
								onpointerenter={() => (hovered = day)}
								onfocus={() => (hovered = day)}
								onblur={() => (hovered = null)}
								onclick={() => (hovered = day)}
							>
								<span
									class={['day-bar', shown?.date === day.date && 'active']}
									style={`height:${day.n ? Math.max(4, (day.n / maxDay) * 100) : 0}%`}
								></span>
							</button>
						</li>
					{/each}
				</ol>
				<div class="axis" aria-hidden="true">
					<span>{days[0].label}</span><span>오늘</span>
				</div>
				<p class="readout" aria-live="polite" data-testid="rec-day-readout">
					{shown ? dayText(shown) : ''}
				</p>
			{:else}
				<div class="empty" data-testid="rec-days-empty">
					<p>아직 푼 문제가 없다. 짧은 문제로 판단을 연습하면 날짜별로 쌓인다.</p>
					<Button
						variant="tonal"
						icon="school"
						data-testid="rec-first-train"
						onclick={() => goto(resolve('/(app)/train'))}>오늘의 훈련 시작</Button
					>
				</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: 12px;
		max-width: 720px;
		margin: 0 auto;
		padding: 0 12px 24px;
	}
	section {
		display: grid;
		gap: 8px;
		padding: 16px;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-surface-container-low);
	}
	h2 {
		margin: 0;
		font-size: var(--md-sys-typescale-title-medium-size);
		font-weight: 800;
	}
	ul,
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	p {
		margin: 0;
	}
	.groups {
		display: grid;
		gap: 12px;
	}
	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.name {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.value {
		flex: none;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-label-medium-size);
	}
	.value b {
		color: var(--md-sys-color-on-surface);
		font-size: var(--md-sys-typescale-title-small-size);
	}
	.track {
		position: relative;
		height: 8px;
		margin: 6px 0 4px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface-container-highest);
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-primary);
	}
	.fair {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: var(--md-sys-color-on-surface);
	}
	.meta {
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-label-small-size);
	}
	.summary {
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.empty {
		display: grid;
		justify-items: start;
		gap: 12px;
		font-size: var(--md-sys-typescale-body-medium-size);
		color: var(--md-sys-color-on-surface-variant);
	}
	.weak-row {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr) 24px 18px;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		color: inherit;
		font-size: var(--md-sys-typescale-body-medium-size);
		text-decoration: none;
	}
	a.weak-row {
		margin-inline: -8px;
		padding-inline: 8px;
		border-radius: var(--md-sys-shape-corner-small);
	}
	a.weak-row:hover {
		background: var(--md-sys-color-surface-container);
	}
	.weak b {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.bar {
		height: 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface-container-highest);
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-primary);
	}
	.days {
		display: grid;
		grid-template-columns: repeat(14, minmax(0, 1fr));
		height: 96px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.days li {
		display: grid;
	}
	.days button {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		min-width: 0;
		padding: 0 1px;
		border: 0;
		background: transparent;
		cursor: pointer;
	}
	.day-bar {
		width: 100%;
		max-width: 28px;
		border-radius: 4px 4px 0 0;
		background: var(--md-sys-color-secondary);
	}
	.day-bar.active {
		background: var(--md-sys-color-primary);
	}
	.axis {
		display: flex;
		justify-content: space-between;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-label-small-size);
	}
	.readout {
		min-height: 1.4em;
		font-size: var(--md-sys-typescale-body-small-size);
		font-variant-numeric: tabular-nums;
	}
</style>
