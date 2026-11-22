<script lang="ts">
	import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
	import '#lib/theme/tokens.css';
	import '#lib/theme/base.css';
	// JS에 data URI로 넣지 않고 파일로 둔다
	import favicon from '#lib/assets/favicon.svg?no-inline';
	import SnackbarHost from '#lib/ui/SnackbarHost.svelte';
	import { onMount } from 'svelte';
	import { ready, setLang, syncDict } from '#lib/i18n/index.ts';
	import { snackbar } from '#lib/ui/snackbar.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// 새 버전 감시는 첫 화면 JS에 넣지 않고 따로 받는다
	onMount(() => {
		if (ready) delete document.documentElement.dataset.i18nPending;
		void syncDict().then((offer) => {
			if (!offer) return;
			snackbar.show({
				message: 'View this app in English?',
				actionLabel: 'English',
				onAction: () => void setLang('en'),
				duration: 10000,
				closable: true
			});
		});
		void import('#lib/app/update.ts').then((m) => m.watchUpdates());
		// 테마가 '기기 설정'이면 시스템 다크 모드 전환을 따라간다
		void import('#lib/theme/apply.ts').then((m) => m.followSystem(m.readPrefs, () => {}));
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<SnackbarHost />
