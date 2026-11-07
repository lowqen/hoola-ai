<script lang="ts" generics="T extends string">
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import type { IconName } from './icons.ts';

	interface Item {
		value: T;
		label: string;
		icon?: IconName;
		disabled?: boolean;
	}
	interface Props {
		items: Item[];
		/** 트리거 아이콘 버튼의 라벨. */
		label: string;
		icon?: IconName;
		onselect: (value: T) => void;
	}
	let { items, label, icon = 'more_vert', onselect }: Props = $props();

	const id = `menu-${Math.random().toString(36).slice(2, 8)}`;
	let pop: HTMLDivElement | undefined = $state();
	let anchor: HTMLSpanElement | undefined = $state();
	let open = $state(false);

	function place() {
		if (!pop || !anchor) return;
		const r = anchor.getBoundingClientRect();
		const w = pop.offsetWidth;
		const h = pop.offsetHeight;
		const left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
		const top = r.bottom + 4 + h > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
		pop.style.left = `${left}px`;
		pop.style.top = `${top}px`;
	}
	function toggle(e: Event) {
		const t = e as ToggleEvent;
		open = t.newState === 'open';
		if (open) {
			place();
			pop?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus();
		}
	}
	function choose(v: T) {
		pop?.hidePopover();
		anchor?.querySelector('button')?.focus();
		onselect(v);
	}
	function onKey(e: KeyboardEvent) {
		const list = [
			...(pop?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])
		];
		const i = list.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
			list[j]?.focus();
		} else if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
		}
	}
</script>

<span class="anchor" bind:this={anchor}>
	<IconButton {icon} {label} popovertarget={id} aria-haspopup="menu" aria-expanded={open} />
</span>
<div
	bind:this={pop}
	{id}
	popover="auto"
	class="menu"
	role="menu"
	tabindex="-1"
	aria-label={label}
	ontoggle={toggle}
	onkeydown={onKey}
>
	{#each items as it (it.value)}
		<button
			type="button"
			role="menuitem"
			class="item md-state"
			disabled={it.disabled}
			onclick={() => choose(it.value)}
		>
			<span class="md-layer" aria-hidden="true"></span>
			{#if it.icon}<Icon name={it.icon} />{/if}
			<span>{it.label}</span>
		</button>
	{/each}
</div>

<style>
	.anchor {
		display: inline-flex;
	}
	.menu {
		position: fixed;
		inset: auto;
		margin: 0;
		min-width: 180px;
		max-width: 280px;
		padding: 8px 0;
		border: 0;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		box-shadow: var(--md-sys-elevation-level2);
	}
	.menu:popover-open {
		animation: open var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 48px;
		padding: 0 16px;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		font-family: var(--md-ref-typeface-plain);
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: 500;
		cursor: pointer;
	}
	.item :global(.icon) {
		color: var(--md-sys-color-on-surface-variant);
	}
	.item:disabled {
		color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
		cursor: default;
	}
	@keyframes open {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.97);
		}
	}
</style>
