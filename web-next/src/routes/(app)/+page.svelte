<script lang="ts">
	// 대전 화면 (DESIGN_PLAN §5.1). 진행은 session, 판 화면은 Board가 맡고, 여기서는 시작 패널과 앱 바를 둔다.
	import { onMount, type Component } from 'svelte';
	import { BOTS } from '#lib/play/bots.ts';
	import LazySheets from '#lib/play/LazySheets.svelte';
	import { session } from '#lib/play/session.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import TopAppBar from '#lib/ui/TopAppBar.svelte';

	onMount(() => session.hydrate());

	let Board = $state.raw<Component>();
	let boardRequested = false;
	$effect(() => {
		if ((session.starting || session.obs) && !boardRequested) {
			boardRequested = true;
			void import('#lib/play/Board.svelte').then((m) => (Board = m.default));
		}
	});

	const obs = $derived(session.obs);
	const beginner = $derived(session.settings.beginner);
	const summary = $derived.by(() => {
		const { players, opponents, beginner: easy } = session.settings;
		const bots = opponents.slice(0, players - 1).map((o) => BOTS[o]?.short ?? o);
		return `${players}인 · ${bots.join('·')} · ${easy ? '초보자' : '셀프'} 모드`;
	});
</script>

<svelte:head>
	<title>훌라 연습장</title>
	<meta
		name="description"
		content="브라우저에서 바로 두는 훌라 연습장. 봇과 대전하고 스톱·땡큐 판단을 연습한다."
	/>
</svelte:head>

<TopAppBar title="훌라">
	{#snippet actions()}
		{#if obs}
			<IconButton
				icon="undo"
				label="되돌리기"
				data-testid="undo"
				disabled={!session.canUndo}
				onclick={() => session.undo()}
			/>
		{/if}
		{#if obs && beginner}
			<IconButton
				icon="lightbulb"
				label="힌트"
				data-testid="hint"
				onclick={() => session.openHint()}
			/>
		{/if}
		<IconButton
			icon="settings"
			label="새 판과 설정"
			data-testid="open-new-game"
			onclick={() => (session.newGameOpen = true)}
		/>
		<IconButton
			icon="help"
			label="규칙과 안내"
			data-testid="open-rules"
			onclick={() => (session.rulesOpen = true)}
		/>
	{/snippet}
</TopAppBar>

<main class={['play', obs && 'playing']}>
	{#if obs}
		{#if Board}<Board />{/if}
	{:else}
		<section class="start" aria-labelledby="start-title">
			<span class="logo" aria-hidden="true">♠</span>
			<h1 id="start-title">훌라 연습장</h1>
			<p class="summary" data-testid="start-summary">{summary}</p>
			<Button
				size="lg"
				icon="playing_cards"
				data-testid="start"
				disabled={session.starting}
				onclick={() => session.newGame()}
				>{session.starting ? '엔진을 불러오는 중…' : '새 판 시작'}</Button
			>
			<div class="secondary">
				<Button variant="text" icon="settings" onclick={() => (session.newGameOpen = true)}
					>상대와 모드 바꾸기</Button
				>
				<Button variant="text" icon="help" onclick={() => (session.rulesOpen = true)}
					>규칙 30초 요약</Button
				>
			</div>
			{#if session.gamesPlayed < 3 && !beginner}
				<Chip
					kind="assist"
					icon="lightbulb"
					onclick={() => {
						session.settings.beginner = true;
						session.saveSettings();
					}}>처음이라면 초보자 모드를 권한다</Chip
				>
			{/if}
			{#if session.engineError}
				<p class="error" role="alert">엔진을 불러오지 못했다: {session.engineError}</p>
			{/if}
		</section>
	{/if}
</main>

<LazySheets />

<style>
	.play {
		display: grid;
		gap: 8px;
		max-width: 720px;
		margin: 0 auto;
		/* 8px: 360px에서 행동 바 슬롯 폭이 48px이 되는 여백 */
		padding: 0 8px 16px;
	}
	@media (min-width: 1200px) {
		.playing {
			grid-template-columns: minmax(0, 1fr) 320px;
			align-items: start;
			max-width: 1080px;
			gap: 16px;
		}
	}
	.start {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 32px 16px;
		text-align: center;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: var(--md-sys-shape-corner-extra-large);
		background: radial-gradient(
			120% 90% at 50% 40%,
			var(--hoola-color-felt-1),
			var(--hoola-color-felt-2)
		);
		color: var(--hoola-color-on-felt);
		font-size: 40px;
	}
	h1 {
		margin: 0;
		font-size: var(--md-sys-typescale-headline-medium-size);
		line-height: var(--md-sys-typescale-headline-medium-line-height);
		font-weight: 800;
	}
	.summary {
		margin: 0 0 8px;
		min-height: 1.5em;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.secondary {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px;
	}
	.error {
		color: var(--md-sys-color-error);
	}
</style>
