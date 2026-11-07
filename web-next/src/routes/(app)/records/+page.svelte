<script lang="ts">
	import TopAppBar from '#lib/ui/TopAppBar.svelte';
</script>

<svelte:head>
	<title>기록 · 훌라 연습장</title>
	<meta name="description" content="훌라 전적과 복기로 본 약점" />
</svelte:head>

<TopAppBar title="기록" />
<main>
	<h1>기록은 다음 단계에서 옮겨 온다</h1>
	<p>이 앱에서 둔 판도 같은 저장소에 쌓이므로, 지금은 현재 버전에서 볼 수 있다.</p>
	<a href="../../" rel="external">현재 버전 연습장으로 →</a>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 16px;
	}
	h1 {
		margin: 0 0 8px;
		font-size: var(--md-sys-typescale-title-large-size);
		font-weight: 800;
	}
	p {
		margin: 0 0 12px;
		color: var(--md-sys-color-on-surface-variant);
	}
	a {
		font-weight: 600;
	}
</style>
