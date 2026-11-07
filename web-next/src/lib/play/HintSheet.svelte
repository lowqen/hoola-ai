<script lang="ts">
	// L3 힌트 (초보자 모드). 계산은 워커에서 한다. 스톱은 시뮬레이션보다 기준표가 우선이다.
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import { stopAdvice } from './actions.ts';
	import { session } from './session.svelte.ts';

	const state = $derived(session.hintState);
	const obs = $derived(session.obs);
	const advice = $derived(
		obs && obs.phase === 'turn_start' && session.legal.includes('stop') ? stopAdvice(obs, 0) : null
	);
</script>

<BottomSheet bind:open={session.hintOpen} label="힌트">
	<h2>힌트</h2>
	{#if !session.myTurn}
		<p class="muted">내 차례에 볼 수 있다.</p>
	{:else if state.status === 'loading' || state.status === 'idle'}
		<p class="muted" role="status">숨은 패 96가지를 끝까지 두어 보는 중…</p>
		<Progress label="힌트 계산 중" />
	{:else if state.status === 'error'}
		<p role="alert">힌트를 계산하지 못했다: {state.message}</p>
	{:else}
		{#if advice}
			<p class={['table', advice.ok ? 'go' : 'wait']}>
				스톱 판단은 기준표 우선: {advice.text}. 아래 스톱 수치는 참고만 한다.
			</p>
		{/if}
		<ol data-testid="hint-list">
			{#each state.moves as move, i (move.action)}
				<li class={[i === 0 && 'best']}>
					<b>{(move.value * 100).toFixed(1)}%</b>
					{#if i > 0}
						{#if move.gap > 2 * move.gap_se}
							<span class="loss">−{(move.gap * 100).toFixed(1)}%p</span>
						{:else}
							<span class="muted">(차이 불확실)</span>
						{/if}
					{/if}
					<span>{move.text}</span>
					{#if move.isExpert}<span class="tag">전문가</span>{/if}
				</li>
			{/each}
		</ol>
		<p class="muted small">
			숨은 패 96가지 × 수마다 끝까지 시뮬레이션한 추정 승률. −%p는 1위보다 확실히 나쁜 만큼, "차이
			불확실"은 사실상 같은 수.
		</p>
	{/if}
</BottomSheet>

<style>
	h2 {
		margin: 0 0 12px;
		font-size: var(--md-sys-typescale-title-large-size);
		font-weight: 800;
	}
	ol {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0 0 12px;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 8px;
		padding: 8px 12px;
		border-radius: var(--md-sys-shape-corner-medium);
		background: var(--md-sys-color-surface-container);
		font-variant-numeric: tabular-nums;
	}
	.best {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	.loss {
		color: var(--md-sys-color-error);
		font-weight: 700;
	}
	.tag {
		padding: 0 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
		font-size: var(--md-sys-typescale-label-small-size);
		font-weight: 700;
	}
	.muted {
		color: var(--md-sys-color-on-surface-variant);
	}
	.best .muted {
		color: inherit;
	}
	.small {
		margin: 0;
		font-size: var(--md-sys-typescale-body-small-size);
	}
	.table {
		margin: 0 0 12px;
		padding: 8px 12px;
		border-radius: var(--md-sys-shape-corner-medium);
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.go {
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
	}
	.wait {
		background: var(--md-sys-color-surface-container-high);
	}
</style>
