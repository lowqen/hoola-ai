<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { selfTest, type SelfTest } from '#lib/engine.ts';

	const REASONS: Record<string, string> = {
		out: '털기',
		'stop-success': '스톱 성공',
		'stop-fail': '스톱 실패',
		'no-cards': '받을 카드 없음',
		'turn-limit': '턴 제한'
	};

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let result = $state<SelfTest | null>(null);
	let error = $state('');

	onMount(async () => {
		try {
			result = await selfTest();
			status = 'ready';
		} catch (e) {
			error = String(e);
			status = 'error';
		}
	});
</script>

<svelte:head>
	<title>개발 정보 · 훌라 연습장</title>
	<meta
		name="description"
		content="Material 3로 다시 만드는 훌라 연습장의 개발 진행 상황과 미리보기 페이지"
	/>
</svelte:head>

<main>
	<header>
		<span class="logo" aria-hidden="true">♠</span>
		<div>
			<h1>개발 정보</h1>
			<p class="sub">새 버전 미리보기 · D4 화면 이식 중</p>
		</div>
	</header>

	<section class="panel" aria-live="polite">
		<h2>엔진 연결</h2>
		<p data-testid="engine-status" data-status={status}>
			{#if status === 'loading'}
				엔진을 불러오는 중…
			{:else if status === 'ready' && result}
				엔진 {result.version} 연결됨 · 전문가 봇 2명이 한 판을 {result.moves}수 만에 끝냈다({REASONS[
					result.reason
				] ?? result.reason}, {result.ms.toFixed(0)}ms)
			{:else}
				엔진을 불러오지 못했다: {error}
			{/if}
		</p>
	</section>

	<section class="panel">
		<h2>진행 상황</h2>
		<ol>
			<li class="done">D0 · SvelteKit 정적 빌드, WASM 연결, CI</li>
			<li class="done">D1 · M3 색·글꼴·모양·모션 토큰</li>
			<li class="done">D2 · 컴포넌트 키트</li>
			<li class="done">D3 · 카드·테이블 컴포넌트와 모션</li>
			<li>D4 · 대전(이식 완료)·훈련·복기·기록 화면</li>
			<li>D5 · 다듬기·설치형 앱(PWA)</li>
		</ol>
		<p class="links">
			<a href={resolve('/(app)')}>대전 →</a>
			<a href={`${resolve('/motion')}/`}>모션 데모 →</a>
			<a href={`${resolve('/gallery')}/`}>컴포넌트 갤러리 →</a>
			<a href={`${resolve('/theme')}/`}>테마 미리보기 →</a>
			<a href="../../" rel="external">지금 버전 연습장으로 →</a>
		</p>
	</section>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: var(--md-sys-shape-corner-large);
		background: radial-gradient(
			120% 90% at 50% 40%,
			var(--hoola-color-felt-1),
			var(--hoola-color-felt-2)
		);
		color: var(--hoola-color-on-felt);
		font-size: 26px;
	}
	h1 {
		margin: 0;
		font-size: var(--md-sys-typescale-headline-small-size);
		line-height: var(--md-sys-typescale-headline-small-line-height);
		font-weight: 700;
	}
	h2 {
		margin: 0 0 8px;
		font-size: var(--md-sys-typescale-title-medium-size);
		line-height: var(--md-sys-typescale-title-medium-line-height);
		font-weight: var(--md-sys-typescale-title-medium-weight);
	}
	.sub {
		margin: 0;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.panel {
		background: var(--md-sys-color-surface-container);
		border-radius: var(--md-sys-shape-corner-extra-large);
		padding: 16px 20px;
	}
	ol {
		margin: 0 0 12px;
		padding-left: 20px;
		color: var(--md-sys-color-on-surface-variant);
	}
	li.done {
		color: var(--md-sys-color-on-surface);
		font-weight: 600;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		margin: 0;
	}
	a {
		font-weight: 600;
	}
</style>
