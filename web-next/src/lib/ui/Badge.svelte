<script lang="ts">
	interface Props {
		/** 숫자면 숫자 배지 (99 넘으면 99+), true면 점. */
		value: number | boolean;
		label?: string;
	}
	let { value, label }: Props = $props();
	const text = $derived(typeof value === 'number' ? (value > 99 ? '99+' : String(value)) : '');
</script>

<span
	class={`badge ${typeof value === 'number' ? 'num' : 'dot'}`}
	aria-label={label ?? (typeof value === 'number' ? `${value}개` : '새 항목')}
	role="status">{text}</span
>

<style>
	.badge {
		position: absolute;
		top: 2px;
		left: calc(50% + 6px);
		display: inline-grid;
		place-items: center;
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
		border-radius: var(--md-sys-shape-corner-full);
		font-size: var(--md-sys-typescale-label-small-size);
		font-weight: 700;
		line-height: 1;
	}
	.dot {
		width: 6px;
		height: 6px;
		top: 4px;
		left: calc(50% + 8px);
	}
	.num {
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
	}
</style>
