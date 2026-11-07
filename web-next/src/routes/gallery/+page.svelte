<script lang="ts">
	import { resolve } from '$app/paths';
	import ActionBar, { type ActionSlot, type PrimaryAction } from '#lib/ui/ActionBar.svelte';
	import AppNav from '#lib/ui/AppNav.svelte';
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Checkbox from '#lib/ui/Checkbox.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Fab from '#lib/ui/Fab.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import SegmentedButton from '#lib/ui/SegmentedButton.svelte';
	import Slider from '#lib/ui/Slider.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import Tooltip from '#lib/ui/Tooltip.svelte';
	import TopAppBar from '#lib/ui/TopAppBar.svelte';
	import { snackbar } from '#lib/ui/snackbar.svelte.ts';

	const VARIANTS = [
		'filled',
		'tonal',
		'outlined',
		'text',
		'elevated',
		'danger',
		'danger-tonal'
	] as const;

	let toggled = $state(true);
	let iconToggle = $state(false);
	let fabHidden = $state(false);
	let players = $state<'2' | '3' | '4' | '5'>('2');
	let filters = $state({ friend: true, expert: false, greedy: false });
	let melds = $state(['5♠ 5♥ 5♦', '7♥']);
	let beginner = $state(false);
	let fullDiscards = $state(true);
	let speed = $state(500);
	let progress = $state(0.4);
	let dialogOpen = $state(false);
	let fullOpen = $state(false);
	let sheetOpen = $state(false);
	let menuChoice = $state('없음');
	let lastAction = $state('없음');
	let discarded = $state<string[]>([]);

	function discard(card: string) {
		discarded = [...discarded, card];
		lastAction = `${card} 버림`;
		snackbar.show({
			message: `${card}를 버렸다`,
			actionLabel: '되돌리기',
			onAction: () => {
				discarded = discarded.slice(0, -1);
				lastAction = `${card} 버리기 되돌림`;
			}
		});
	}

	// ---- 휴대폰 화면 데모: 단계가 바뀌어도 행동 바 슬롯 자리는 고정 ----
	type Phase = 'start' | 'meld' | 'wait';
	let phase = $state<Phase>('start');
	let selected = $state<string[]>([]);
	let navActive = $state<'play' | 'train' | 'stats'>('play');
	const HAND = ['5♠', '5♥', '5♦', '9♣', 'K♦'];
	const toggleCard = (c: string) =>
		(selected = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

	let slots = $derived<ActionSlot[]>([
		{
			id: 'stop',
			label: '스톱',
			icon: 'stop_circle',
			tone: 'danger',
			enabled: phase === 'start',
			reason: '스톱은 차례 시작(받기 전)에만',
			onclick: () => (lastAction = '스톱')
		},
		{
			id: 'thankyou',
			label: '땡큐',
			icon: 'front_hand',
			enabled: phase === 'start' && selected.length >= 2,
			reason: phase === 'start' ? '함께 등록할 내 카드 2장 이상을 고르세요' : '땡큐는 받기 전에만',
			onclick: () => (lastAction = '땡큐')
		},
		{
			id: 'register',
			label: '등록',
			icon: 'layers',
			enabled: phase === 'meld' && selected.length >= 1,
			emphasized: beginner && phase === 'meld',
			reason: phase === 'meld' ? '등록할 카드를 고르세요' : '받은 뒤에 등록',
			onclick: () => (lastAction = `등록 ${selected.join(' ')}`)
		},
		{
			id: 'attach',
			label: '붙이기',
			icon: 'swap_horiz',
			enabled: phase === 'meld' && selected.length === 1,
			reason: '카드 1장을 고르세요',
			onclick: () => (lastAction = `붙이기 ${selected[0]}`)
		}
	]);
	let primary = $derived<PrimaryAction>(
		phase === 'start'
			? {
					label: '받기',
					icon: 'playing_cards' as const,
					enabled: true,
					onclick: () => {
						phase = 'meld';
					}
				}
			: phase === 'meld'
				? {
						label: '버리기',
						icon: 'arrow_forward' as const,
						enabled: selected.length === 1,
						onclick: () => {
							discard(selected[0]);
							selected = [];
							phase = 'wait';
						}
					}
				: { label: '상대 차례', icon: 'timer' as const, enabled: false }
	);
	let preview = $derived(
		selected.length
			? phase === 'meld'
				? selected.length === 1
					? `버리기 또는 붙이기 ${selected[0]}`
					: `등록 ${selected.join(' ')}`
				: phase === 'start'
					? `땡큐 ${selected.join(' ')} + 버림패`
					: undefined
			: undefined
	);
</script>

<svelte:head>
	<title>컴포넌트 갤러리 · 훌라 연습장</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="훌라 연습장 Material 3 컴포넌트 키트의 모든 상태" />
</svelte:head>

<main class="page">
	<a class="back" href={resolve('/(app)')}>← 미리보기 홈</a>
	<h1 class="md-typescale-headline-medium-emphasized">컴포넌트 갤러리</h1>
	<p class="md-typescale-body-medium muted">
		D2 · 모든 컴포넌트와 상태. 마우스 올리기·포커스(Tab)·누르기를 직접 해 보세요. 테마는 <a
			href={`${resolve('/theme')}/`}>테마 미리보기</a
		>에서 바꾼다.
	</p>

	<section class="block" aria-labelledby="h-buttons">
		<h2 id="h-buttons" class="md-typescale-title-large">버튼</h2>
		<div class="grid-buttons">
			{#each VARIANTS as v (v)}
				<span class="md-typescale-label-medium muted">{v}</span>
				<Button variant={v} data-testid={`btn-${v}`}>{v === 'danger' ? '스톱' : '받기'}</Button>
				<Button variant={v} icon="playing_cards">아이콘</Button>
				<Button variant={v} disabled>비활성</Button>
			{/each}
		</div>
		<div class="row">
			<Button size="sm">작게 40</Button>
			<Button size="md" icon="playing_cards">보통 56</Button>
			<Button size="lg" icon="playing_cards">크게 72</Button>
		</div>
		<div class="row">
			<Button
				variant="tonal"
				icon="lightbulb"
				selected={toggled}
				onclick={() => (toggled = !toggled)}>토글 {toggled ? '켜짐' : '꺼짐'}</Button
			>
		</div>
	</section>

	<section class="block" aria-labelledby="h-icon">
		<h2 id="h-icon" class="md-typescale-title-large">아이콘 버튼 · 툴팁 · 메뉴</h2>
		<div class="row">
			<Tooltip text="되돌리기 (마지막 내 수)"><IconButton icon="undo" label="되돌리기" /></Tooltip>
			<IconButton icon="settings" label="설정" variant="filled" />
			<IconButton icon="help" label="도움말" variant="tonal" />
			<IconButton icon="history" label="기록" variant="outlined" />
			<IconButton
				icon="visibility_off"
				selectedIcon="visibility"
				label="지난 버림패 보기"
				selected={iconToggle}
				onclick={() => (iconToggle = !iconToggle)}
			/>
			<IconButton icon="delete" label="비활성" disabled />
			<Menu
				label="더보기"
				items={[
					{ value: 'rules', label: '규칙 보기', icon: 'help' },
					{ value: 'export', label: '기록 내보내기', icon: 'download' },
					{ value: 'settings', label: '설정', icon: 'settings' },
					{ value: 'off', label: '비활성 항목', disabled: true }
				]}
				onselect={(v) => (menuChoice = v)}
			/>
			<span class="md-typescale-body-medium" data-testid="menu-choice">메뉴 선택: {menuChoice}</span
			>
		</div>
	</section>

	<section class="block" aria-labelledby="h-fab">
		<h2 id="h-fab" class="md-typescale-title-large">FAB</h2>
		<div class="row fabs">
			<Fab icon="add" label="새 판" hidden={fabHidden} />
			<Fab icon="playing_cards" color="tertiary" hidden={fabHidden}>받기</Fab>
			<Fab icon="school" color="secondary" size="large" hidden={fabHidden}>오늘의 훈련</Fab>
			<Button variant="text" onclick={() => (fabHidden = !fabHidden)}
				>{fabHidden ? '보이기' : '숨기기'}</Button
			>
		</div>
	</section>

	<section class="block" aria-labelledby="h-select">
		<h2 id="h-select" class="md-typescale-title-large">선택 · 칩</h2>
		<SegmentedButton
			label="인원"
			testid="seg-players"
			bind:value={players}
			options={[
				{ value: '2', label: '2인' },
				{ value: '3', label: '3인' },
				{ value: '4', label: '4인' },
				{ value: '5', label: '5인', disabled: true }
			]}
		/>
		<p class="md-typescale-body-small muted" data-testid="seg-value">인원: {players}</p>
		<div class="row">
			<Chip icon="help">규칙 보기</Chip>
			<Chip icon="replay" elevated>같은 패 다시</Chip>
			<Chip kind="filter" bind:selected={filters.friend}>친구</Chip>
			<Chip kind="filter" bind:selected={filters.expert}>고수</Chip>
			<Chip kind="filter" bind:selected={filters.greedy}>초보</Chip>
			<Chip kind="assist" disabled>비활성</Chip>
		</div>
		<div class="row">
			{#each melds as m, i (m)}
				<Chip kind="input" removeLabel={`${m} 묶음 풀기`} onremove={() => melds.splice(i, 1)}
					>{m}</Chip
				>
			{/each}
			{#if !melds.length}<Button variant="text" onclick={() => (melds = ['5♠ 5♥ 5♦', '7♥'])}
					>묶음 되살리기</Button
				>{/if}
		</div>
	</section>

	<section class="block" aria-labelledby="h-controls">
		<h2 id="h-controls" class="md-typescale-title-large">스위치 · 체크박스 · 슬라이더 · 진행</h2>
		<div class="col">
			<Switch label="초보자 모드" testid="switch-beginner" bind:checked={beginner} />
			<Switch label="지나간 버림패 전부 보기" bind:checked={fullDiscards} icons={false} />
			<Switch label="비활성 스위치" checked={false} disabled />
			<Checkbox label="매 결정마다 힌트 자동 표시" checked={true} />
			<Slider
				label="봇 속도"
				bind:value={speed}
				min={100}
				max={1000}
				step={50}
				format={(v) => `${v}ms`}
			/>
			<Slider
				label="진행 (데모)"
				bind:value={progress}
				min={0}
				max={1}
				step={0.05}
				format={(v) => `${Math.round(v * 100)}%`}
			/>
			<Progress label="복기 분석" value={progress} />
			<Progress label="문제 만드는 중" />
			<div class="row">
				<Progress label="분석" kind="circular" value={progress} />
				<Progress label="불러오는 중" kind="circular" />
			</div>
		</div>
	</section>

	<section class="block" aria-labelledby="h-cards">
		<h2 id="h-cards" class="md-typescale-title-large">카드(패널)</h2>
		<div class="cards">
			<Card variant="filled"
				><b>Filled</b>
				<p class="md-typescale-body-small">전적·약점 패널</p></Card
			>
			<Card variant="outlined"
				><b>Outlined</b>
				<p class="md-typescale-body-small">설정 묶음</p></Card
			>
			<Card variant="elevated"
				><b>Elevated</b>
				<p class="md-typescale-body-small">떠 있는 패널</p></Card
			>
			<Card
				variant="elevated"
				onclick={() => (lastAction = '훈련 카드')}
				label="조합 찾기 훈련 시작"
			>
				<b>조합 찾기</b>
				<p class="md-typescale-body-small">누를 수 있는 카드 · 최근 정답률 80%</p>
			</Card>
		</div>
	</section>

	<section class="block" aria-labelledby="h-overlay">
		<h2 id="h-overlay" class="md-typescale-title-large">대화상자 · 시트 · 스낵바</h2>
		<div class="row">
			<Button
				variant="tonal"
				icon="help"
				onclick={() => (dialogOpen = true)}
				data-testid="open-dialog">규칙 요약 (대화상자)</Button
			>
			<Button variant="tonal" icon="history" onclick={() => (fullOpen = true)}
				>복기 (전체 화면)</Button
			>
			<Button variant="tonal" icon="add" onclick={() => (sheetOpen = true)} data-testid="open-sheet"
				>새 판 (바텀 시트)</Button
			>
			<Button variant="outlined" onclick={() => discard('K♦')} data-testid="snack-undo"
				>K♦ 버리기 (되돌리기 스낵바)</Button
			>
			<Button
				variant="text"
				onclick={() =>
					snackbar.show({ message: '손패 23점: 10점 이하일 때만 스톱할 수 있다', closable: true })}
				>규칙 안내 스낵바</Button
			>
		</div>
		<p class="md-typescale-body-medium" data-testid="last-action">
			마지막 행동: {lastAction} · 버린 카드 {discarded.length}장
		</p>
	</section>

	<section class="block" aria-labelledby="h-device">
		<h2 id="h-device" class="md-typescale-title-large">휴대폰 화면 데모 (고정 슬롯 행동 바)</h2>
		<p class="md-typescale-body-medium muted">
			단계를 바꾸고 카드를 골라 보세요. 행동 바의 버튼 자리는 바뀌지 않고, 할 수 없는 행동은
			비활성으로 남는다. 초보자 모드를 켜면 지금 할 수 있는 행동이 강조된다.
		</p>
		<SegmentedButton
			label="단계"
			testid="seg-phase"
			bind:value={phase}
			onchange={() => (selected = [])}
			options={[
				{ value: 'start', label: '차례 시작' },
				{ value: 'meld', label: '받은 뒤' },
				{ value: 'wait', label: '상대 차례' }
			]}
		/>
		<div class="device" data-testid="device">
			<TopAppBar title="훌라" subtitle="2인 · 친구" scrolled={false} sticky={false}>
				{#snippet actions()}
					<IconButton icon="undo" label="되돌리기" />
					<IconButton icon="more_vert" label="더보기" />
				{/snippet}
			</TopAppBar>
			<div class="device-body">
				<div class="hand" role="group" aria-label="내 손패">
					{#each HAND as c (c)}
						<button
							type="button"
							class={`pcard ${c.includes('♥') || c.includes('♦') ? 'red' : ''}`}
							aria-pressed={selected.includes(c)}
							disabled={phase === 'wait'}
							onclick={() => toggleCard(c)}>{c}</button
						>
					{/each}
				</div>
				<ActionBar
					{slots}
					{primary}
					{preview}
					hint={phase === 'wait' ? '상대가 생각 중…' : '카드를 골라 행동을 고르세요'}
				/>
			</div>
			<AppNav
				contained
				layout="bar"
				active={navActive}
				onselect={(id) => (navActive = id)}
				destinations={[
					{ id: 'play', label: '대전', icon: 'playing_cards' },
					{ id: 'train', label: '훈련', icon: 'school', badge: 3 },
					{ id: 'stats', label: '기록', icon: 'bar_chart', badge: true }
				]}
			/>
		</div>
	</section>
</main>

<Dialog bind:open={dialogOpen} headline="스톱 기준표" icon="stop_circle">
	<p>가장 적게 든 상대의 장수를 보고 정한다.</p>
	<p><b>1장 금지 · 2장 4점 · 3장 8점 · 4장 이상 10점</b> 이하이면 스톱.</p>
	{#snippet actions()}
		<Button variant="text" onclick={() => (dialogOpen = false)}>닫기</Button>
		<Button variant="text" onclick={() => (dialogOpen = false)}>훈련하기</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={fullOpen} headline="판 복기" fullscreen>
	<p class="md-typescale-body-large">
		전체 화면 대화상자: 휴대폰에서는 화면을 꽉 채우고, 넓은 화면에서는 큰 창이 된다.
	</p>
	<Progress label="분석" value={0.7} />
</Dialog>

<BottomSheet bind:open={sheetOpen} label="새 판">
	<h2 class="md-typescale-title-large">새 판</h2>
	<div class="col">
		<SegmentedButton
			label="인원"
			bind:value={players}
			options={[
				{ value: '2', label: '2인' },
				{ value: '3', label: '3인' },
				{ value: '4', label: '4인' }
			]}
		/>
		<div class="row">
			<Chip kind="filter" bind:selected={filters.friend}>친구</Chip>
			<Chip kind="filter" bind:selected={filters.expert}>고수</Chip>
		</div>
		<Switch label="초보자 모드" bind:checked={beginner} />
		<Button
			size="md"
			icon="playing_cards"
			wide
			onclick={() => (sheetOpen = false)}
			data-testid="sheet-start">시작</Button
		>
	</div>
</BottomSheet>

<style>
	.page {
		max-width: 1040px;
		margin: 0 auto;
		padding: 16px 16px 120px;
	}
	.back {
		font-weight: 600;
		text-decoration: none;
	}
	h1 {
		margin: 8px 0 4px;
	}
	.muted {
		color: var(--md-sys-color-on-surface-variant);
	}
	.block {
		margin: 32px 0;
	}
	.block h2 {
		margin: 0 0 12px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin: 10px 0;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		max-width: 420px;
	}
	.grid-buttons {
		display: grid;
		grid-template-columns: 100px repeat(3, max-content);
		gap: 10px 12px;
		align-items: center;
		overflow-x: auto;
	}
	.fabs {
		min-height: 104px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 12px;
	}
	.cards p {
		margin: 4px 0 0;
		color: var(--md-sys-color-on-surface-variant);
	}
	.device {
		position: relative;
		width: min(390px, 100%);
		height: 640px;
		margin-top: 12px;
		border-radius: 36px;
		overflow: hidden;
		background: var(--md-sys-color-surface);
		box-shadow:
			0 0 0 8px var(--md-sys-color-surface-container-highest),
			var(--md-sys-elevation-level3);
	}
	.device-body {
		position: absolute;
		inset: 64px 0 80px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 12px;
		padding: 12px;
		background: radial-gradient(
			120% 90% at 50% 30%,
			var(--hoola-color-felt-1),
			var(--hoola-color-felt-2)
		);
	}
	.hand {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.pcard {
		width: 52px;
		height: 72px;
		border: 1px solid var(--hoola-color-card-edge);
		border-radius: var(--md-sys-shape-corner-medium);
		background: var(--hoola-color-card-face);
		color: var(--hoola-color-card-ink);
		font-family: var(--md-ref-typeface-plain);
		font-size: 18px;
		font-weight: 800;
		cursor: pointer;
		transition: transform var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.pcard.red {
		color: var(--hoola-color-card-red);
	}
	.pcard[aria-pressed='true'] {
		transform: translateY(-10px);
		box-shadow:
			0 0 0 3px var(--hoola-color-felt-highlight),
			var(--md-sys-elevation-level3);
	}
	.pcard:disabled {
		cursor: default;
	}
</style>
