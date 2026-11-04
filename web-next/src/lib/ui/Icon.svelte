<script lang="ts">
	import { ICONS, type IconName } from './icons.ts';

	interface Props {
		name: IconName;
		/** px. 기본 24 (M3 아이콘 크기). */
		size?: number;
		/** 의미가 있는 아이콘이면 라벨을, 장식이면 비워 둔다(스크린 리더가 건너뜀). */
		label?: string;
	}
	let { name, size = 24, label }: Props = $props();
</script>

<span
	class="icon"
	style={`--icon-size: ${size}px`}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- 빌드 때 고정된 SVG 문자열 -->
	{@html ICONS[name]}
</span>

<style>
	.icon {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--icon-size);
		height: var(--icon-size);
		line-height: 0;
	}
	.icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
</style>
