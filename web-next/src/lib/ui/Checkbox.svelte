<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		checked: boolean;
		label: string;
		disabled?: boolean;
		onchange?: (checked: boolean) => void;
	}
	let { checked = $bindable(), label, disabled = false, onchange }: Props = $props();
</script>

<label class={`cb ${disabled ? 'disabled' : ''}`}>
	<input type="checkbox" bind:checked {disabled} onchange={() => onchange?.(checked)} />
	<span class="box" aria-hidden="true"
		>{#if checked}<Icon name="check" size={16} />{/if}</span
	>
	<span class="text">{label}</span>
</label>

<style>
	.cb {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		cursor: pointer;
	}
	input {
		position: absolute;
		opacity: 0;
		width: 18px;
		height: 18px;
		margin: 0;
	}
	.box {
		display: grid;
		place-items: center;
		flex: none;
		width: 18px;
		height: 18px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 2px var(--md-sys-color-on-surface-variant);
		color: var(--md-sys-color-on-primary);
		transition: background-color var(--md-sys-motion-spring-standard-effects-fast-duration)
			var(--md-sys-motion-spring-standard-effects-fast);
	}
	input:checked + .box {
		background: var(--md-sys-color-primary);
		box-shadow: none;
	}
	input:focus-visible + .box {
		outline: 3px solid var(--md-sys-color-tertiary);
		outline-offset: 3px;
	}
	.disabled {
		opacity: 0.38;
		cursor: default;
	}
</style>
