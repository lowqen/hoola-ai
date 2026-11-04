<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		checked: boolean;
		label: string;
		/** 라벨을 화면에 보이지 않게 (근처에 설명이 이미 있을 때). */
		hideLabel?: boolean;
		disabled?: boolean;
		icons?: boolean;
		onchange?: (checked: boolean) => void;
		testid?: string;
	}
	let {
		checked = $bindable(),
		label,
		hideLabel = false,
		disabled = false,
		icons = true,
		onchange,
		testid
	}: Props = $props();
</script>

<label class={`sw ${disabled ? 'disabled' : ''}`}>
	<input
		type="checkbox"
		role="switch"
		bind:checked
		{disabled}
		aria-checked={checked}
		data-testid={testid}
		onchange={() => onchange?.(checked)}
	/>
	<span class="track" aria-hidden="true">
		<span class="handle">
			{#if icons}<Icon name={checked ? 'check' : 'close'} size={16} />{/if}
		</span>
	</span>
	<span class={hideLabel ? 'visually-hidden' : 'text'}>{label}</span>
</label>

<style>
	.sw {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		cursor: pointer;
		font-size: var(--md-sys-typescale-body-large-size);
	}
	input {
		position: absolute;
		opacity: 0;
		width: 52px;
		height: 32px;
		margin: 0;
	}
	.track {
		position: relative;
		flex: none;
		width: 52px;
		height: 32px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface-container-highest);
		box-shadow: inset 0 0 0 2px var(--md-sys-color-outline);
		transition: background-color var(--md-sys-motion-spring-standard-effects-default-duration)
			var(--md-sys-motion-spring-standard-effects-default);
	}
	.handle {
		position: absolute;
		top: 50%;
		left: 4px;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--md-sys-color-outline);
		color: var(--md-sys-color-surface-container-highest);
		transform: translateY(-50%);
		transition:
			transform var(--md-sys-motion-spring-expressive-spatial-fast-duration)
				var(--md-sys-motion-spring-expressive-spatial-fast),
			width var(--md-sys-motion-spring-expressive-spatial-fast-duration)
				var(--md-sys-motion-spring-expressive-spatial-fast),
			background-color var(--md-sys-motion-spring-standard-effects-default-duration)
				var(--md-sys-motion-spring-standard-effects-default);
	}
	input:checked + .track {
		background: var(--md-sys-color-primary);
		box-shadow: none;
	}
	input:checked + .track .handle {
		transform: translate(20px, -50%);
		background: var(--md-sys-color-on-primary);
		color: var(--md-sys-color-on-primary-container);
	}
	input:active:not(:disabled) + .track .handle {
		width: 28px;
	}
	input:focus-visible + .track {
		outline: 3px solid var(--md-sys-color-tertiary);
		outline-offset: 2px;
	}
	.disabled {
		cursor: default;
		opacity: 0.38;
	}
</style>
