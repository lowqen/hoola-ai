<script lang="ts">
	interface Props {
		/** 0..1. 없으면 진행 정도를 모르는 상태(계속 움직임). */
		value?: number;
		kind?: 'linear' | 'circular';
		label: string;
	}
	let { value, kind = 'linear', label }: Props = $props();
	const pct = $derived(
		value === undefined ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
	);
	const R = 18;
	const C = 2 * Math.PI * R;
</script>

<span
	class={`prog ${kind} ${pct === undefined ? 'indeterminate' : ''}`}
	role="progressbar"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={pct}
>
	{#if kind === 'linear'}
		<span class="track"
			><span class="bar" style={pct === undefined ? '' : `width: ${pct}%`}></span></span
		>
	{:else}
		<svg viewBox="0 0 48 48" aria-hidden="true">
			<circle class="bg" cx="24" cy="24" r={R} />
			<circle
				class="fg"
				cx="24"
				cy="24"
				r={R}
				stroke-dasharray={C}
				stroke-dashoffset={pct === undefined ? C * 0.7 : C * (1 - pct / 100)}
			/>
		</svg>
	{/if}
</span>

<style>
	.linear {
		display: block;
		width: 100%;
	}
	.track {
		position: relative;
		display: block;
		height: 4px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-secondary-container);
		overflow: hidden;
	}
	.bar {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: inherit;
		background: var(--md-sys-color-primary);
		transition: width var(--md-sys-motion-spring-standard-spatial-default-duration)
			var(--md-sys-motion-spring-standard-spatial-default);
	}
	.indeterminate .bar {
		width: 40%;
		animation: slide 1.4s var(--md-sys-motion-easing-emphasized) infinite;
	}
	.circular {
		display: inline-block;
		width: 48px;
		height: 48px;
	}
	svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}
	circle {
		fill: none;
		stroke-width: 4;
		stroke-linecap: round;
	}
	.bg {
		stroke: var(--md-sys-color-secondary-container);
	}
	.fg {
		stroke: var(--md-sys-color-primary);
		transition: stroke-dashoffset var(--md-sys-motion-spring-standard-spatial-default-duration)
			var(--md-sys-motion-spring-standard-spatial-default);
	}
	.circular.indeterminate svg {
		animation: spin 1.1s linear infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
	@keyframes spin {
		to {
			transform: rotate(270deg);
		}
	}
</style>
