<script lang="ts">
	// 앱 전체 설정: 화면 테마. 새 판 시트와 훈련·기록 탭의 설정 시트에서 함께 쓴다.
	import { applyPrefs, readPrefs, type ThemePref } from '#lib/theme/apply.ts';
	import SegmentedButton from '#lib/ui/SegmentedButton.svelte';

	let prefs = $state(readPrefs());

	function setTheme(value: string) {
		prefs.theme = value as ThemePref;
		applyPrefs(prefs);
	}
</script>

<div class="display">
	<h3>화면</h3>
	<SegmentedButton
		label="화면"
		testid="theme"
		value={prefs.theme}
		onchange={setTheme}
		options={[
			{ value: 'auto', label: '기기 설정' },
			{ value: 'light', label: '라이트' },
			{ value: 'dark', label: '다크' }
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
</style>
