<script lang="ts">
	// 앱 전체 설정: 화면 테마와 언어. 새 판 시트와 훈련·기록 탭의 설정 시트에서 함께 쓴다.
	import { t, lang, setLang, type Lang } from '#lib/i18n/index.ts';
	import { applyPrefs, readPrefs, type ThemePref } from '#lib/theme/apply.ts';
	import SegmentedButton from '#lib/ui/SegmentedButton.svelte';

	let prefs = $state(readPrefs());

	function setTheme(value: string) {
		prefs.theme = value as ThemePref;
		applyPrefs(prefs);
	}

	function changeLang(value: string) {
		if (value !== lang) void setLang(value as Lang);
	}
</script>

<div class="display">
	<h3>{t('화면')}</h3>
	<SegmentedButton
		label={t('화면')}
		testid="theme"
		value={prefs.theme}
		onchange={setTheme}
		options={[
			{ value: 'auto', label: t('기기 설정') },
			{ value: 'light', label: t('라이트') },
			{ value: 'dark', label: t('다크') }
		]}
	/>
	<h3 class="lang">{t('언어')} · Language</h3>
	<SegmentedButton
		label={t('언어')}
		testid="lang"
		value={lang}
		onchange={changeLang}
		options={[
			{ value: 'ko', label: '한국어' },
			{ value: 'en', label: 'English' }
		]}
	/>
</div>

<style>
	h3 {
		margin: 0 0 8px;
		font-size: var(--md-sys-typescale-title-small-size);
		font-weight: 700;
		color: var(--md-sys-color-on-surface-variant);
	}
	h3.lang {
		margin-top: 16px;
	}
</style>
