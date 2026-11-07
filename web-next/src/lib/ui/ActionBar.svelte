<script lang="ts">
	// 게임 행동 바 (DESIGN_PLAN §6.1-3 고정 슬롯):
	// [스톱] [땡큐] [등록] [붙이기] … [주 행동] 순서와 자리는 단계가 바뀌어도 절대 움직이지 않는다.
	// 지금 못 하는 행동은 숨기지 않고 비활성으로 둔다. 미리보기 줄은 높이가 고정이라 바가 흔들리지 않는다.
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';
	import { ripple } from './ripple.ts';

	export interface ActionSlot {
		id: string;
		label: string;
		icon: IconName;
		/** false면 비활성 (자리는 유지). */
		enabled: boolean;
		/** 초보자 모드에서 지금 할 수 있는 행동을 강조. */
		emphasized?: boolean;
		tone?: 'normal' | 'danger';
		/** 누를 수 없는 이유 (비활성일 때 툴팁·스크린 리더). */
		reason?: string;
		onclick?: () => void;
	}
	export interface PrimaryAction {
		label: string;
		icon: IconName;
		enabled: boolean;
		onclick?: () => void;
	}
	interface Props {
		slots: ActionSlot[];
		primary: PrimaryAction;
		/** 고른 카드로 할 행동 미리보기 (예: "등록 5♠ 5♥ 5♦"). 없으면 빈 줄. */
		preview?: string;
		/** 안내 한 줄 (미리보기가 없을 때). */
		hint?: string;
		/** 비활성 슬롯을 눌렀을 때 (규칙 안내, DESIGN_PLAN §6.1-3). */
		onblocked?: (slot: ActionSlot) => void;
	}
	let { slots, primary, preview, hint, onblocked }: Props = $props();
</script>

<div class="action-bar" role="toolbar" aria-label="행동" data-coach="actions">
	<div class="preview" aria-live="polite" data-testid="action-preview">
		{#if preview}<span class="chip">{preview}</span>{:else if hint}<span class="hint">{hint}</span
			>{/if}
	</div>
	<div class="row">
		<div class="slots">
			{#each slots as s (s.id)}
				<button
					type="button"
					class={`slot md-state ${s.tone ?? 'normal'} ${s.emphasized && s.enabled ? 'emph' : ''}`}
					data-slot={s.id}
					aria-disabled={!s.enabled}
					aria-describedby={!s.enabled && s.reason ? `why-${s.id}` : undefined}
					title={!s.enabled && s.reason ? s.reason : s.label}
					onclick={() => (s.enabled ? s.onclick?.() : onblocked?.(s))}
					use:ripple
				>
					<span class="md-layer" aria-hidden="true"></span>
					<span class="ic"><Icon name={s.icon} /></span>
					<span class="lb">{s.label}</span>
					{#if !s.enabled && s.reason}<span id={`why-${s.id}`} class="visually-hidden"
							>{s.reason}</span
						>{/if}
				</button>
			{/each}
		</div>
		<button
			type="button"
			class="primary md-state"
			data-slot="primary"
			aria-disabled={!primary.enabled}
			onclick={() => primary.enabled && primary.onclick?.()}
			use:ripple
		>
			<span class="md-layer" aria-hidden="true"></span>
			<Icon name={primary.icon} />
			<span>{primary.label}</span>
		</button>
	</div>
</div>

<style>
	.action-bar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 12px calc(12px + env(safe-area-inset-bottom));
		border-radius: var(--md-sys-shape-corner-extra-large);
		background: var(--md-sys-color-surface-container);
	}
	.preview {
		height: 28px;
		display: flex;
		align-items: center;
		overflow: hidden;
	}
	.chip {
		max-width: 100%;
		padding: 2px 12px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		animation: pop var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.hint {
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-small-size);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.slots {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 4px;
		min-width: 0;
	}
	.slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 64px;
		padding: 6px 2px;
		border: 0;
		border-radius: var(--md-sys-shape-corner-large);
		background: transparent;
		color: var(--md-sys-color-on-surface);
		font-family: var(--md-ref-typeface-plain);
		cursor: pointer;
		transition:
			background-color var(--md-sys-motion-spring-standard-effects-default-duration)
				var(--md-sys-motion-spring-standard-effects-default),
			border-radius var(--md-sys-motion-spring-expressive-spatial-fast-duration)
				var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.slot:active:not([aria-disabled='true']) {
		border-radius: var(--md-sys-shape-corner-small);
	}
	.ic {
		display: grid;
		place-items: center;
		width: 48px;
		height: 32px;
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.danger .ic {
		background: var(--md-sys-color-error-container);
		color: var(--md-sys-color-on-error-container);
	}
	.emph .ic {
		background: var(--md-sys-color-tertiary-container);
		color: var(--md-sys-color-on-tertiary-container);
		box-shadow: 0 0 0 2px var(--md-sys-color-tertiary);
	}
	.lb {
		font-size: var(--md-sys-typescale-label-medium-size);
		font-weight: var(--md-sys-typescale-label-medium-weight);
		white-space: nowrap;
	}
	.slot[aria-disabled='true'] {
		cursor: default;
		color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
	}
	.slot[aria-disabled='true'] .ic {
		background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
		color: inherit;
		box-shadow: none;
	}
	.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		/* 라벨(받기·버리기·상대 차례…)이 바뀌어도 폭이 같아야 옆 슬롯이 흔들리지 않는다 */
		flex: none;
		width: 124px;
		height: 64px;
		padding: 0 12px;
		white-space: nowrap;
		overflow: hidden;
		border: 0;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		box-shadow: var(--md-sys-elevation-level2);
		font-family: var(--md-ref-typeface-plain);
		font-size: var(--md-sys-typescale-title-medium-size);
		font-weight: 800;
		cursor: pointer;
		transition: border-radius var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.primary:active:not([aria-disabled='true']) {
		border-radius: var(--md-sys-shape-corner-medium);
	}
	.primary[aria-disabled='true'] {
		cursor: default;
		background: color-mix(in srgb, var(--md-sys-color-on-surface) 10%, transparent);
		color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
		box-shadow: none;
	}
	@media (max-width: 600px) {
		.action-bar {
			gap: 4px;
			padding: 6px 12px calc(8px + env(safe-area-inset-bottom));
		}
		.preview {
			height: 24px;
		}
	}
	@media (max-width: 400px) {
		.primary {
			width: 108px;
			padding: 0 8px;
			font-size: var(--md-sys-typescale-title-small-size);
		}
		.ic {
			width: 40px;
		}
	}
	@keyframes pop {
		from {
			transform: scale(0.92);
			opacity: 0;
		}
	}
</style>
