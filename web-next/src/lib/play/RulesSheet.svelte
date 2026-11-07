<script lang="ts">
	// 규칙 30초 요약 (DESIGN_PLAN §6.4). 판정의 기준은 RULES.md다.
	import PlayingCard from '#lib/game/PlayingCard.svelte';
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import Button from '#lib/ui/Button.svelte';
	import { session } from './session.svelte.ts';

	const EXAMPLES = [
		{ name: '세트', text: '같은 숫자 3장 이상', cards: ['5S', '5H', '5D'] },
		{ name: '런', text: '같은 무늬 연속 3장 이상 (K 다음은 A)', cards: ['8C', '9C', 'TC'] },
		{ name: '7', text: '7은 한 장만으로 등록할 수 있다', cards: ['7H'] }
	];
	const STOP_ROWS = [
		['1장', '스톱 금지'],
		['2장', '4점 이하'],
		['3장', '8점 이하'],
		['4장 이상', '10점 이하']
	];
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

	<h3>스톱</h3>
	<p>
		받기 전에 손패 10점 이하면 선언할 수 있다. 다른 모두보다 낮아야 이긴다. 전략서 기준표(가장 적게
		든 상대의 장수 기준)는 다음과 같다.
	</p>
	<table>
		<thead><tr><th scope="col">상대 최소 장수</th><th scope="col">스톱 기준</th></tr></thead>
		<tbody>
			{#each STOP_ROWS as [count, limit] (count)}
				<tr><td>{count}</td><td>{limit}</td></tr>
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
	.again {
		display: flex;
		justify-content: center;
		margin-top: 16px;
	}
</style>
