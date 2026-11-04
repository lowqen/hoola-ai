<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { applyPrefs, followSystem, readPrefs, type Prefs } from '#lib/theme/apply.ts';
	import { checkContrast, themeColors, type ContrastResult } from '#lib/theme/scheme.ts';
	import {
		HIERARCHY,
		SEED,
		SHAPE,
		SPRINGS,
		TYPE_SCALE,
		type ContrastName,
		type ThemeName
	} from '#lib/theme/spec.ts';

	let prefs = $state<Prefs>({ theme: 'auto', contrast: 'auto' });
	let applied = $state<{ theme: ThemeName; contrast: ContrastName }>({
		theme: 'light',
		contrast: 'standard'
	});
	let seed = $state(SEED);
	let colors = $derived(themeColors(seed, applied.theme, applied.contrast));
	let results = $derived<ContrastResult[]>(checkContrast(colors));
	let failCount = $derived(results.filter((r) => !r.ok).length);
	/** 시드를 바꿨을 때만 미리보기 영역에 색을 직접 넣는다 (기본 시드는 tokens.css 그대로). */
	let overrideStyle = $derived(
		seed.toLowerCase() === SEED
			? ''
			: Object.entries(colors)
					.map(([k, v]) =>
						/^(felt|on-felt|card|grade)/.test(k)
							? `--hoola-color-${k}:${v}`
							: `--md-sys-color-${k}:${v}`
					)
					.join(';')
	);

	onMount(() => {
		prefs = readPrefs();
		applied = applyPrefs(prefs, false);
		return followSystem(
			() => prefs,
			() => (applied = applyPrefs(prefs, false))
		);
	});

	function setTheme(theme: Prefs['theme']) {
		prefs = { ...prefs, theme };
		applied = applyPrefs(prefs);
	}
	function setContrast(contrast: Prefs['contrast']) {
		prefs = { ...prefs, contrast };
		applied = applyPrefs(prefs);
	}

	const ROLE_GROUPS: [string, string][][] = [
		[
			['primary', 'on-primary'],
			['primary-container', 'on-primary-container']
		],
		[
			['secondary', 'on-secondary'],
			['secondary-container', 'on-secondary-container']
		],
		[
			['tertiary', 'on-tertiary'],
			['tertiary-container', 'on-tertiary-container']
		],
		[
			['error', 'on-error'],
			['error-container', 'on-error-container']
		]
	];
	const SURFACES = [
		'surface-container-lowest',
		'surface-container-low',
		'surface-container',
		'surface-container-high',
		'surface-container-highest'
	];

	const springNames = Object.keys(SPRINGS.expressive) as (keyof typeof SPRINGS.expressive)[];
	let moved = $state<Record<string, boolean>>({});
	const toggle = (k: string) => (moved = { ...moved, [k]: !moved[k] });

	const SAMPLE = '훌라 손패 23점 · 땡큐 7♥ 8♥';
</script>

<svelte:head>
	<title>테마 미리보기 · 훌라 연습장</title>
	<meta name="description" content="훌라 연습장 Material 3 디자인 토큰 미리보기" />
</svelte:head>

<main class="page" style={overrideStyle}>
	<header class="top">
		<a class="back" href={resolve('/')}>← 미리보기 홈</a>
		<h1 class="md-typescale-headline-medium-emphasized">테마 미리보기</h1>
		<p class="md-typescale-body-medium muted">
			D1 · 시드 <code>{seed}</code> · M3 TonalSpot(2025 스펙) · 제3색 금색 · {applied.theme ===
			'dark'
				? '다크'
				: '라이트'} · {applied.contrast === 'standard'
				? '기본 대비'
				: applied.contrast === 'medium'
					? '중간 대비'
					: '높은 대비'}
		</p>
	</header>

	<section class="controls" aria-label="테마 설정">
		<div class="seg" role="radiogroup" aria-label="밝기">
			{#each [['auto', '자동'], ['light', '라이트'], ['dark', '다크']] as const as [v, label] (v)}
				<button
					role="radio"
					aria-checked={prefs.theme === v}
					data-testid={`theme-${v}`}
					onclick={() => setTheme(v)}>{label}</button
				>
			{/each}
		</div>
		<div class="seg" role="radiogroup" aria-label="대비">
			{#each [['auto', '자동'], ['standard', '기본'], ['medium', '중간'], ['high', '높음']] as const as [v, label] (v)}
				<button
					role="radio"
					aria-checked={prefs.contrast === v}
					data-testid={`contrast-${v}`}
					onclick={() => setContrast(v)}>{label}</button
				>
			{/each}
		</div>
		<label class="seed">
			<span class="md-typescale-label-large">시드 색 (미리보기만)</span>
			<input type="color" bind:value={seed} aria-label="시드 색" />
			{#if seed.toLowerCase() !== SEED}
				<button class="text" onclick={() => (seed = SEED)}>되돌리기</button>
			{/if}
		</label>
	</section>

	<section class="block">
		<h2 class="md-typescale-title-large">색 역할</h2>
		<div class="roles">
			{#each ROLE_GROUPS as group, gi (gi)}
				<div class="role-group">
					{#each group as [bg, fg] (bg)}
						<div
							class="swatch"
							style={`background: var(--md-sys-color-${bg}); color: var(--md-sys-color-${fg})`}
						>
							<span class="md-typescale-label-large">{bg}</span>
							<span class="md-typescale-body-small mono">{colors[bg]}</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
		<div class="surfaces">
			{#each SURFACES as s (s)}
				<div class="surface-chip" style={`background: var(--md-sys-color-${s})`}>
					<span class="md-typescale-label-medium"
						>{s.replace('surface-container', 'container')}</span
					>
					<span class="md-typescale-body-small mono muted">{colors[s]}</span>
				</div>
			{/each}
		</div>
		<div class="inverse md-typescale-body-medium">
			스낵바처럼 반전된 표면 — <span style="color: var(--md-sys-color-inverse-primary)"
				>inverse-primary 동작</span
			>
		</div>
	</section>

	<section class="block">
		<h2 class="md-typescale-title-large">게임 색</h2>
		<div class="felt">
			<div class="seat">
				<span class="hoola-type-seat-name">1번 실전친구</span>
				<span class="hoola-type-opp-count">3<small>장</small></span>
			</div>
			<div class="cards">
				<span class="card"><b>7</b><i>♥</i></span>
				<span class="card"><b>8</b><i>♥</i></span>
				<span class="card black"><b>K</b><i>♠</i></span>
				<span class="card selected black"><b>A</b><i>♣</i></span>
				<span class="card back" aria-hidden="true"></span>
			</div>
			<p class="md-typescale-body-small on-felt-variant">
				보조 글자 · 선택 카드와 차례 강조는 felt-highlight
			</p>
		</div>
		<div class="grades">
			{#each [['best', '★ 최선'], ['inaccuracy', '? 부정확'], ['mistake', '! 실수'], ['blunder', '✕ 블런더']] as [g, label] (g)}
				<span class={`grade grade-${g}`}>{label}</span>
			{/each}
		</div>
	</section>

	<section class="block">
		<h2 class="md-typescale-title-large">
			명암 대비 검사 <span
				class={`badge ${failCount ? 'bad' : 'ok'}`}
				data-testid="contrast-fail-count"
				data-count={failCount}
				>{failCount ? `${failCount}개 실패` : `${results.length}쌍 모두 통과`}</span
			>
		</h2>
		<table class="contrast md-typescale-body-small">
			<thead><tr><th>용도</th><th>전경 / 배경</th><th>대비</th><th>기준</th></tr></thead>
			<tbody>
				{#each results as r (r.fg + r.bg)}
					<tr class={r.ok ? '' : 'fail'}>
						<td>{r.use}</td>
						<td class="mono">{r.fg} / {r.bg}</td>
						<td class="num">{r.ratio.toFixed(2)}</td>
						<td>{r.ok ? '✓' : '✕'} {r.min}:1</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="block">
		<h2 class="md-typescale-title-large">글자 체계</h2>
		<div class="type-list">
			{#each Object.entries(TYPE_SCALE) as [role, sizes] (role)}
				{#each Object.entries(sizes) as [size, spec] (size)}
					<div class="type-row">
						<span class="md-typescale-label-small muted">{role}-{size} · {spec[0]}/{spec[1]}</span>
						<span class={`md-typescale-${role}-${size}`}>{SAMPLE}</span>
					</div>
				{/each}
			{/each}
		</div>
		<h3 class="md-typescale-title-medium">정보 위계 (화면 우선순위)</h3>
		<div class="hier">
			{#each HIERARCHY as [name, role, size] (name)}
				<div class="type-row">
					<span class="md-typescale-label-small muted">{name} → {role}-{size}</span>
					<span class={`hoola-type-${name}`}>
						{name === 'my-score'
							? '23점'
							: name === 'opp-count'
								? '3장'
								: name === 'turn'
									? '내 차례 · 받기 전'
									: name === 'stat'
										? '73.3%'
										: SAMPLE}
					</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="block">
		<h2 class="md-typescale-title-large">모양 · 높이</h2>
		<div class="shapes">
			{#each Object.entries(SHAPE).filter(([k]) => k !== 'none') as [k, v] (k)}
				<div class="shape" style={`border-radius: var(--md-sys-shape-corner-${k})`}>
					<span class="md-typescale-label-small">{k}</span>
					<span class="md-typescale-body-small">{v === 9999 ? 'full' : `${v}px`}</span>
				</div>
			{/each}
		</div>
		<div class="elev">
			{#each [0, 1, 2, 3, 4, 5] as l (l)}
				<div class="level" style={`box-shadow: var(--md-sys-elevation-level${l})`}>
					<span class="md-typescale-label-large">level {l}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="block">
		<h2 class="md-typescale-title-large">모션 (스프링)</h2>
		<p class="md-typescale-body-medium muted">
			카드를 눌러 움직여 보세요. spatial = 위치 이동, effects = 색·투명도. 시스템의 "동작 줄이기"가
			켜져 있으면 즉시 바뀐다.
		</p>
		{#each ['expressive', 'standard'] as const as scheme (scheme)}
			<h3 class="md-typescale-title-small">
				{scheme === 'expressive' ? 'Expressive' : 'Standard'}
			</h3>
			<div class="motion-grid">
				{#each springNames as name (name)}
					{@const key = `${scheme}-${name}`}
					<button
						class="track"
						onclick={() => toggle(key)}
						aria-label={`${scheme} ${name} 재생`}
						aria-pressed={!!moved[key]}
					>
						<span class="md-typescale-label-medium">{name}</span>
						<span
							class={`puck ${name.startsWith('effects') ? 'fx' : ''} ${moved[key] ? 'on' : ''}`}
							style={`--dur: var(--md-sys-motion-spring-${key}-duration); --ease: var(--md-sys-motion-spring-${key})`}
						></span>
					</button>
				{/each}
			</div>
		{/each}
	</section>

	<section class="block">
		<h2 class="md-typescale-title-large">상태 레이어</h2>
		<div class="states">
			<button class="state filled">Filled</button>
			<button class="state tonal">Tonal</button>
			<button class="state outlined">Outlined</button>
			<button class="state error">스톱</button>
		</div>
		<p class="md-typescale-body-small muted">
			마우스 올리기 8% · 포커스 10% · 누르기 10% (드래그 16%는 D3 카드에서)
		</p>
	</section>
</main>

<style>
	.page {
		max-width: 1040px;
		margin: 0 auto;
		padding: 16px 16px 64px;
		color: var(--md-sys-color-on-surface);
		background: var(--md-sys-color-surface);
	}
	.top h1 {
		margin: 8px 0 4px;
	}
	.top p {
		margin: 0;
	}
	.back {
		font: inherit;
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: var(--md-sys-typescale-label-large-weight);
		text-decoration: none;
	}
	.muted {
		color: var(--md-sys-color-on-surface-variant);
	}
	.on-felt-variant {
		color: var(--hoola-color-on-felt-variant);
		margin: 8px 0 0;
	}
	.mono {
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
	}
	code {
		font-family: ui-monospace, Consolas, monospace;
	}
	.controls {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		margin: 16px 0;
		padding: 12px;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-surface-container);
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-full);
		overflow: hidden;
	}
	.seg button {
		border: 0;
		border-right: 1px solid var(--md-sys-color-outline);
		background: transparent;
		color: var(--md-sys-color-on-surface);
		min-height: 40px;
		padding: 0 14px;
		font: inherit;
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: var(--md-sys-typescale-label-large-weight);
		cursor: pointer;
	}
	.seg button:last-child {
		border-right: 0;
	}
	.seg button[aria-checked='true'] {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.seed {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.seed input {
		width: 44px;
		height: 36px;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-small);
		background: none;
		padding: 2px;
	}
	button.text {
		border: 0;
		background: none;
		color: var(--md-sys-color-primary);
		font: inherit;
		font-weight: 600;
		min-height: 40px;
		cursor: pointer;
	}
	.block {
		margin: 28px 0;
	}
	.block h2 {
		margin: 0 0 12px;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.block h3 {
		margin: 18px 0 8px;
	}
	.roles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 10px;
	}
	.role-group {
		display: flex;
		flex-direction: column;
		border-radius: var(--md-sys-shape-corner-large);
		overflow: hidden;
	}
	.swatch {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 8px;
		padding: 12px;
		min-height: 64px;
	}
	.surfaces {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 8px;
		margin-top: 10px;
	}
	.surface-chip {
		display: flex;
		flex-direction: column;
		padding: 12px;
		border-radius: var(--md-sys-shape-corner-medium);
		outline: 1px solid var(--md-sys-color-outline-variant);
	}
	.inverse {
		margin-top: 10px;
		padding: 14px 16px;
		border-radius: var(--md-sys-shape-corner-extra-small);
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		box-shadow: var(--md-sys-elevation-level3);
	}
	.felt {
		padding: 16px;
		border-radius: var(--md-sys-shape-corner-extra-large);
		background: radial-gradient(
			120% 90% at 50% 40%,
			var(--hoola-color-felt-1),
			var(--hoola-color-felt-2)
		);
		color: var(--hoola-color-on-felt);
	}
	.seat {
		display: inline-flex;
		align-items: baseline;
		gap: 12px;
		padding: 8px 14px;
		border-radius: var(--md-sys-shape-corner-large);
		background: rgb(0 0 0 / 0.22);
		outline: 2px solid var(--hoola-color-felt-highlight);
	}
	.seat small {
		font-size: var(--md-sys-typescale-label-medium-size);
		margin-left: 2px;
	}
	.cards {
		display: flex;
		gap: 8px;
		margin-top: 14px;
		flex-wrap: wrap;
	}
	.card {
		position: relative;
		width: 54px;
		height: 76px;
		border-radius: var(--md-sys-shape-corner-medium);
		background: var(--hoola-color-card-face);
		color: var(--hoola-color-card-red);
		border: 1px solid var(--hoola-color-card-edge);
		box-shadow: var(--md-sys-elevation-level1);
	}
	.card.black {
		color: var(--hoola-color-card-ink);
	}
	.card b {
		position: absolute;
		top: 6px;
		left: 8px;
		font-size: 18px;
	}
	.card i {
		position: absolute;
		right: 7px;
		bottom: 4px;
		font-style: normal;
		font-size: 26px;
	}
	.card.selected {
		transform: translateY(-10px);
		box-shadow:
			0 0 0 3px var(--hoola-color-felt-highlight),
			var(--md-sys-elevation-level3);
	}
	.card.back {
		border: 2px solid var(--hoola-color-card-face);
		background:
			repeating-linear-gradient(45deg, transparent 0 4px, rgb(255 255 255 / 0.12) 4px 6px),
			linear-gradient(160deg, var(--hoola-color-card-back-2), var(--hoola-color-card-back-1));
	}
	.grades {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}
	.grade {
		padding: 4px 10px;
		border-radius: var(--md-sys-shape-corner-full);
		color: var(--hoola-color-grade-on);
		font-weight: 700;
		font-size: var(--md-sys-typescale-label-medium-size);
	}
	.grade-best {
		background: var(--hoola-color-grade-best);
	}
	.grade-inaccuracy {
		background: var(--hoola-color-grade-inaccuracy);
		color: var(--hoola-color-grade-on-inaccuracy);
	}
	.grade-mistake {
		background: var(--hoola-color-grade-mistake);
	}
	.grade-blunder {
		background: var(--hoola-color-grade-blunder);
	}
	.badge {
		padding: 2px 10px;
		border-radius: var(--md-sys-shape-corner-full);
		font-size: var(--md-sys-typescale-label-medium-size);
		font-weight: 700;
	}
	.badge.ok {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	.badge.bad {
		background: var(--md-sys-color-error-container);
		color: var(--md-sys-color-on-error-container);
	}
	.contrast {
		width: 100%;
		border-collapse: collapse;
	}
	.contrast th,
	.contrast td {
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.contrast .num {
		font-variant-numeric: tabular-nums;
	}
	.contrast tr.fail td {
		color: var(--md-sys-color-error);
		font-weight: 700;
	}
	.type-list,
	.hier {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.type-row {
		display: grid;
		grid-template-columns: 170px minmax(0, 1fr);
		gap: 12px;
		align-items: baseline;
		padding: 4px 0;
		border-bottom: 1px dashed var(--md-sys-color-outline-variant);
		overflow: hidden;
	}
	.type-row > :last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 560px) {
		.type-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
		}
	}
	.shapes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 10px;
	}
	.shape {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		height: 90px;
		padding: 10px;
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	.elev {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 16px;
		margin-top: 16px;
	}
	.level {
		display: grid;
		place-items: center;
		height: 70px;
		border-radius: var(--md-sys-shape-corner-medium);
		background: var(--md-sys-color-surface-container-low);
	}
	.motion-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 8px;
	}
	.track {
		position: relative;
		display: flex;
		align-items: center;
		height: 56px;
		padding: 0 12px;
		border: 0;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface);
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	.puck {
		position: absolute;
		left: 130px;
		width: 28px;
		height: 38px;
		border-radius: var(--md-sys-shape-corner-small);
		background: var(--md-sys-color-tertiary);
		transition: transform var(--dur) var(--ease);
	}
	.puck.on {
		transform: translateX(80px);
	}
	.puck.fx {
		transition:
			background-color var(--dur) var(--ease),
			opacity var(--dur) var(--ease);
		opacity: 0.35;
	}
	.puck.fx.on {
		transform: none;
		opacity: 1;
		background: var(--md-sys-color-primary);
	}
	.states {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.state {
		position: relative;
		overflow: hidden;
		min-height: 40px;
		padding: 0 24px;
		border-radius: var(--md-sys-shape-corner-full);
		border: 0;
		font: inherit;
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: var(--md-sys-typescale-label-large-weight);
		cursor: pointer;
		--layer: currentColor;
	}
	.state::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--layer);
		opacity: 0;
		transition: opacity var(--md-sys-motion-spring-standard-effects-fast-duration)
			var(--md-sys-motion-spring-standard-effects-fast);
	}
	.state:hover::before {
		opacity: var(--md-sys-state-hover-state-layer-opacity);
	}
	.state:focus-visible::before {
		opacity: var(--md-sys-state-focus-state-layer-opacity);
	}
	.state:active::before {
		opacity: var(--md-sys-state-pressed-state-layer-opacity);
	}
	.state.filled {
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.state.tonal {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.state.outlined {
		background: transparent;
		color: var(--md-sys-color-primary);
		outline: 1px solid var(--md-sys-color-outline);
		outline-offset: -1px;
	}
	.state.error {
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
</style>
