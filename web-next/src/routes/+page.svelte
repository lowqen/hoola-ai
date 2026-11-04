<script lang="ts">
	import { onMount } from 'svelte';
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
	<title>훌라 연습장 · 새 버전 미리보기</title>
	<meta name="description" content="Material 3로 다시 만드는 훌라 연습장의 미리보기" />
</svelte:head>

<main>
	<header>
		<span class="logo" aria-hidden="true">♠</span>
		<div>
			<h1>훌라 연습장</h1>
			<p class="sub">새 버전 미리보기 · D0 기반</p>
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
			<li>D1 · M3 색·글꼴·모양·모션 토큰</li>
			<li>D2 · 컴포넌트 키트</li>
			<li>D3 · 카드·테이블 컴포넌트와 모션</li>
			<li>D4 · 대전·훈련·복기·기록 화면</li>
			<li>D5 · 다듬기·설치형 앱(PWA)</li>
		</ol>
		<p><a href="../" rel="external">지금 버전 연습장으로 →</a></p>
	</section>
</main>

<style>
	:global(:root) {
		--bg: #f4f1ea;
		--surface: #fffdf8;
		--ink: #1c1c1a;
		--muted: #6a685f;
		--accent: #1f6f50;
		color-scheme: light dark;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #121412;
			--surface: #1d201e;
			--ink: #ecece8;
			--muted: #a3a39b;
			--accent: #6cc79f;
		}
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--ink);
		font:
			16px/1.5 system-ui,
			-apple-system,
			'Apple SD Gothic Neo',
			'Malgun Gothic',
			sans-serif;
	}
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
		width: 44px;
		height: 44px;
		border-radius: 14px;
		background: var(--accent);
		color: var(--surface);
		font-size: 24px;
	}
	h1 {
		margin: 0;
		font-size: 22px;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 16px;
	}
	.sub {
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}
	.panel {
		background: var(--surface);
		border-radius: 20px;
		padding: 16px 20px;
	}
	ol {
		margin: 0 0 12px;
		padding-left: 20px;
		color: var(--muted);
	}
	li.done {
		color: var(--ink);
		font-weight: 600;
	}
	a {
		color: var(--accent);
		font-weight: 600;
	}
</style>
