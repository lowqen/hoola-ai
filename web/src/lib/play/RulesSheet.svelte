<script lang="ts">
	// 규칙 30초 요약 (DESIGN_PLAN §6.4). 판정의 기준은 RULES.md다.
	import PlayingCard from '#lib/game/PlayingCard.svelte';
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import Button from '#lib/ui/Button.svelte';
	import { stopTableFor } from './actions.ts';
	import { session } from './session.svelte.ts';

	const EXAMPLES = [
		{ name: '세트', text: '같은 숫자 3장 이상', cards: ['5S', '5H', '5D'] },
		{ name: '런', text: '같은 무늬 연속 3장 이상 (K 다음은 A)', cards: ['8C', '9C', 'TC'] },
		{ name: '7', text: '7은 한 장만으로 등록할 수 있다', cards: ['7H'] }
	];
	const limit = $derived(session.stopLimit);
	/** 기준표를 장수별로 묶는다: 같은 값이 이어지는 뒤쪽은 "n장 이상"으로 접는다. */
	const stopRows = $derived.by(() => {
		const table = stopTableFor(limit);
		const rows: [string, string][] = [];
		for (let k = 1; k < table.length; k++) {
			const text = table[k] === null ? '스톱 금지' : `${table[k]}점 이하`;
			if (table.slice(k).every((v) => v === table[k]) && k < table.length - 1) {
				rows.push([`${k}장 이상`, text]);
				break;
			}
			rows.push([`${k}장`, text]);
		}
		return rows;
	});
</script>

<BottomSheet bind:open={session.rulesOpen} label="규칙 요약">
	<h2>규칙 30초 요약</h2>
	<p>손패를 먼저 모두 내면(털기) 이긴다. 손패 점수는 A=1, 숫자 그대로, J·Q·K=11·12·13이다.</p>

	<h3>조합</h3>
	<ul class="melds">
		{#each EXAMPLES as example (example.name)}
			<li>
				<span class="cards">
					{#each example.cards as card (card)}<PlayingCard {card} size="xs" />{/each}
				</span>
				<span><b>{example.name}</b> · {example.text}</span>
			</li>
		{/each}
	</ul>

	<h3>내 차례</h3>
	<ol>
		<li>스톱 또는 땡큐를 하거나 더미에서 1장 받는다.</li>
		<li>조합을 등록하거나, 한 번 등록한 뒤에는 바닥 조합에 붙인다.</li>
		<li>1장을 버린다.</li>
	</ol>

	<h3>땡큐</h3>
	<p>바로 앞 사람이 버린 맨 위 카드와 내 손패 2장 이상으로 조합을 만들어 등록한다.</p>

	<h3>
		스톱{#if session.stop5}<span class="badge" data-testid="rules-stop5">1:1 스톱 5점</span>{/if}
	</h3>
	<p data-testid="rules-stop-limit">
		받기 전에 손패 {limit}점 이하면 선언할 수 있다. 다른 모두보다 낮아야 이긴다. 전략서 기준표(가장
		적게 든 상대의 장수 기준)는 다음과 같다.
	</p>
	{#if session.stop5}
		<p class="note">
			변형 규칙에서는 스톱이 늦어지고 털기로 끝나는 판이 늘어난다. 페어·연속 같은 조각을 평소보다
			오래 남겨 털기를 노린다.
		</p>
	{/if}
	<table data-testid="stop-table">
		<thead><tr><th scope="col">상대 최소 장수</th><th scope="col">스톱 기준</th></tr></thead>
		<tbody>
			{#each stopRows as [count, text] (count)}
				<tr><td>{count}</td><td>{text}</td></tr>
			{/each}
		</tbody>
	</table>

	<div class="again">
		<Button
			variant="tonal"
			icon="help"
			data-testid="replay-coach"
			disabled={!session.obs}
			onclick={() => {
				session.rulesOpen = false;
				session.coachStep = 1;
			}}>화면 안내 다시 보기</Button
		>
	</div>
</BottomSheet>

<style>
	h2 {
		margin: 0 0 8px;
		font-size: var(--md-sys-typescale-title-large-size);
		font-weight: 800;
	}
	h3 {
		margin: 16px 0 6px;
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 700;
	}
	p {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	.melds {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.melds li {
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr);
		align-items: center;
		gap: 8px;
	}
	.cards {
		display: flex;
		gap: 2px;
	}
	ol {
		margin: 0;
		padding-left: 20px;
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	table {
		width: 100%;
		margin-top: 8px;
		border-collapse: collapse;
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	th,
	td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
		text-align: left;
	}
	th {
		font-weight: 700;
	}
	.badge {
		margin-left: 8px;
		padding: 2px 8px;
		border-radius: var(--md-sys-shape-corner-small);
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
		font-size: var(--md-sys-typescale-label-medium-size);
		font-weight: 700;
	}
	.note {
		margin-top: 6px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.again {
		display: flex;
		justify-content: center;
		margin-top: 16px;
	}
</style>
