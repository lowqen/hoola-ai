<script lang="ts">
	// 기록 패널 (DESIGN_PLAN §6.3): 휴대폰은 최근 3줄 미리보기, 넓은 화면은 오른쪽 패널에 전체.
	import Button from '#lib/ui/Button.svelte';
	import type { LogLine } from './session.svelte.ts';

	let { lines }: { lines: LogLine[] } = $props();
	let expanded = $state(false);
	let list = $state<HTMLOListElement>();

	$effect(() => {
		void lines.length;
		if (list) list.scrollTop = list.scrollHeight;
	});
</script>

<section class={['log', expanded && 'expanded']} aria-label="이번 판 기록">
	<div class="head">
		<h2>기록</h2>
		<span class="more">
			<Button
				variant="text"
				size="sm"
				data-testid="log-toggle"
				onclick={() => (expanded = !expanded)}>{expanded ? '접기' : '전체 보기'}</Button
			>
		</span>
	</div>
	<ol bind:this={list} data-testid="log">
		{#each lines as line, i (line.id)}
			<li class={[line.kind, i < lines.length - 3 && 'old']}>{line.text}</li>
		{/each}
	</ol>
</section>

<style>
	.log {
		padding: 4px 12px 12px;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-surface-container-low);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 700;
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--md-sys-typescale-body-small-size);
		line-height: var(--md-sys-typescale-body-small-line-height);
	}
	li {
		padding: 1px 0;
		color: var(--md-sys-color-on-surface-variant);
	}
	.mine {
		color: var(--md-sys-color-on-surface);
		font-weight: 700;
	}
	.sys {
		font-style: italic;
	}
	.old {
		display: none;
	}
	.expanded .old {
		display: list-item;
	}
	.expanded ol {
		max-height: 320px;
		overflow-y: auto;
	}
	@media (min-width: 1200px) {
		.more {
			display: none;
		}
		.old {
			display: list-item;
		}
		ol {
			max-height: 560px;
			overflow-y: auto;
		}
	}
</style>
