<script lang="ts">
	// 새 판 시트 (DESIGN_PLAN §6.2): 자주 바꾸는 것만 보여 주고, 세부 설정은 펼침 영역에 둔다.
	import { t } from '#lib/i18n/index.ts';
	import DisplaySettings from '#lib/app/DisplaySettings.svelte';
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import SegmentedButton from '#lib/ui/SegmentedButton.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import { botAbout, BOTS, PRESETS, presetOf } from './bots.ts';
	import { session } from './session.svelte.ts';

	const settings = $derived(session.settings);
	let custom = $state(false);
	const preset = $derived(custom ? null : presetOf(settings));
	const about = (key: string) => botAbout(key, settings.players, !!settings.stop5);

	function setPlayers(value: string) {
		settings.players = +value;
		session.saveSettings();
	}
	function setMode(value: string) {
		settings.beginner = value === 'beginner';
		session.saveSettings();
	}
	function setSpeed(value: string) {
		settings.speed = +value;
		session.saveSettings();
	}
	function choosePreset(id: string) {
		custom = false;
		session.choosePreset(id);
	}
</script>

<BottomSheet bind:open={session.newGameOpen} label={t('새 판과 설정')}>
	<h2>{t('새 판')}</h2>

	<h3 id="players-title">{t('인원')}</h3>
	<SegmentedButton
		label={t('인원')}
		testid="players"
		value={String(settings.players)}
		onchange={setPlayers}
		options={[
			{ value: '2', label: t('2인') },
			{ value: '3', label: t('3인') },
			{ value: '4', label: t('4인') },
			{ value: '5', label: t('5인') }
		]}
	/>
	{#if settings.players === 2}
		<div class="variant">
			<Switch
				label={t('1:1 스톱 5점')}
				checked={!!settings.stop5}
				testid="stop5"
				onchange={(checked) => {
					settings.stop5 = checked;
					session.saveSettings();
				}}
			/>
			<p class="desc">{t('켜면 손패 5점 이하일 때만 스톱할 수 있다 (친구 변형 규칙).')}</p>
		</div>
	{/if}

	<h3>{t('상대')}</h3>
	<div class="chips" data-testid="presets">
		{#each PRESETS as id (id)}
			<Chip kind="filter" selected={preset === id} onclick={() => choosePreset(id)}
				>{BOTS[id].name} <span class="level">{BOTS[id].level}</span></Chip
			>
		{/each}
		<Chip kind="filter" selected={preset === null} onclick={() => (custom = true)}>{t('직접')}</Chip
		>
	</div>
	{#if preset}
		<p class="desc" data-testid="preset-desc">{about(preset)}</p>
	{:else}
		<div class="custom">
			{#each settings.opponents.slice(0, settings.players - 1) as opponent, i (i)}
				<label>
					<span>{t('{n}번 상대', { n: i + 1 })}</span>
					<select
						value={opponent}
						onchange={(e) => {
							settings.opponents[i] = e.currentTarget.value;
							session.saveSettings();
						}}
					>
						{#each Object.entries(BOTS) as [key, bot] (key)}
							<option value={key}>{bot.name} · {bot.level}</option>
						{/each}
					</select>
					<span class="desc">{about(opponent)}</span>
				</label>
			{/each}
		</div>
	{/if}

	<h3>{t('모드')}</h3>
	<SegmentedButton
		label={t('모드')}
		testid="mode"
		value={settings.beginner ? 'beginner' : 'self'}
		onchange={setMode}
		options={[
			{ value: 'self', label: t('셀프 (실전처럼)') },
			{ value: 'beginner', label: t('초보자 (힌트)') }
		]}
	/>

	<details>
		<summary>{t('세부 설정')}</summary>
		<div class="details">
			<DisplaySettings />
			<div>
				<h3>{t('봇 속도')}</h3>
				<SegmentedButton
					label={t('봇 속도')}
					testid="speed"
					value={String(settings.speed)}
					onchange={setSpeed}
					options={[
						{ value: '900', label: t('느리게') },
						{ value: '500', label: t('보통') },
						{ value: '150', label: t('빠르게') }
					]}
				/>
			</div>
			<Switch
				label={t('지나간 버림패 모두 보기')}
				checked={settings.fullDiscards}
				testid="full-discards"
				onchange={(checked) => {
					settings.fullDiscards = checked;
					session.saveSettings();
				}}
			/>
			{#if settings.beginner}
				<Switch
					label={t('내 차례마다 자동 힌트')}
					checked={settings.autoHint}
					testid="auto-hint"
					onchange={(checked) => {
						settings.autoHint = checked;
						session.saveSettings();
					}}
				/>
			{/if}
			<label class="seed">
				<span>{t('시드 (비우면 무작위)')}</span>
				<input
					inputmode="numeric"
					value={settings.seed}
					data-testid="seed"
					onchange={(e) => {
						settings.seed = e.currentTarget.value.trim();
						session.saveSettings();
					}}
				/>
			</label>
		</div>
	</details>

	<div class="start">
		<Button
			wide
			size="md"
			icon="playing_cards"
			data-testid="start-game"
			disabled={session.starting}
			onclick={() => session.newGame()}>{t('시작')}</Button
		>
	</div>
	<p class="note">{t('바뀐 인원과 상대는 다음 판부터 적용된다.')}</p>
</BottomSheet>

<style>
	h2 {
		margin: 0 0 4px;
		font-size: var(--md-sys-typescale-title-large-size);
		font-weight: 800;
	}
	h3 {
		margin: 16px 0 8px;
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 700;
		color: var(--md-sys-color-on-surface-variant);
	}
	.level {
		margin-left: 2px;
		padding: 0 6px;
		border-radius: var(--md-sys-shape-corner-extra-small);
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font-size: var(--md-sys-typescale-label-small-size);
		font-weight: 600;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.variant {
		margin-top: 12px;
	}
	.variant .desc {
		margin-top: 4px;
	}
	.desc {
		margin: 8px 0 0;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-small-size);
	}
	.custom {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--md-sys-typescale-label-large-size);
	}
	select,
	input {
		min-height: 48px;
		padding: 0 12px;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-small);
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		font: inherit;
	}
	details {
		margin-top: 16px;
	}
	summary {
		min-height: 48px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 700;
		cursor: pointer;
	}
	summary::before {
		content: '▸';
		transition: transform 120ms;
	}
	details[open] summary::before {
		transform: rotate(90deg);
	}
	.details {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.details h3 {
		margin-top: 0;
	}
	.start {
		margin-top: 20px;
	}
	.note {
		margin: 8px 0 0;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-small-size);
		text-align: center;
	}
</style>
