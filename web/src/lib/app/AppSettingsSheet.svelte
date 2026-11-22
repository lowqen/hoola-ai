<script lang="ts">
	// 훈련·기록 탭의 설정 시트. 대전 탭은 새 판 시트의 세부 설정에 같은 항목이 있다.
	import { t } from '#lib/i18n/index.ts';
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import DisplaySettings from './DisplaySettings.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<BottomSheet bind:open label={t('설정')}>
	<h2>{t('설정')}</h2>
	<DisplaySettings />
</BottomSheet>

<style>
	h2 {
		margin: 0 0 16px;
		font-size: var(--md-sys-typescale-title-large-size);
		font-weight: 800;
	}
</style>
