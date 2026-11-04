<script lang="ts">
	interface Props {
		value: number;
		label: string;
		min?: number;
		max?: number;
		step?: number;
		/** 값 표시 형식 (예: v => `${v}ms`). */
		format?: (v: number) => string;
		disabled?: boolean;
	}
	let {
		value = $bindable(),
		label,
		min = 0,
		max = 100,
		step = 1,
		format = (v) => String(v),
		disabled = false
	}: Props = $props();
	const pct = $derived(((value - min) / (max - min)) * 100);
</script>

<label class="slider">
	<span class="head">
		<span class="text">{label}</span>
		<output class="value">{format(value)}</output>
	</span>
	<input
		type="range"
		bind:value
		{min}
		{max}
		{step}
		{disabled}
		aria-valuetext={format(value)}
		style={`--pct: ${pct}%`}
	/>
</label>

<style>
	.slider {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 200px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		font-size: var(--md-sys-typescale-body-medium-size);
	}
	.value {
		font-variant-numeric: tabular-nums;
		color: var(--md-sys-color-on-surface-variant);
	}
	input {
		appearance: none;
		width: 100%;
		height: 44px;
		margin: 0;
		background: transparent;
		cursor: pointer;
	}
	input::-webkit-slider-runnable-track {
		height: 16px;
		border-radius: var(--md-sys-shape-corner-full);
		background: linear-gradient(
			to right,
			var(--md-sys-color-primary) 0 var(--pct),
			var(--md-sys-color-secondary-container) var(--pct) 100%
		);
	}
	input::-moz-range-track {
		height: 16px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-secondary-container);
	}
	input::-moz-range-progress {
		height: 16px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-primary);
	}
	input::-webkit-slider-thumb {
		appearance: none;
		width: 4px;
		height: 44px;
		margin-top: -14px;
		border-radius: 2px;
		background: var(--md-sys-color-primary);
	}
	input::-moz-range-thumb {
		width: 4px;
		height: 44px;
		border: 0;
		border-radius: 2px;
		background: var(--md-sys-color-primary);
	}
	input:focus-visible {
		outline: 3px solid var(--md-sys-color-tertiary);
		outline-offset: 2px;
		border-radius: var(--md-sys-shape-corner-small);
	}
	input:disabled {
		opacity: 0.38;
		cursor: default;
	}
</style>
