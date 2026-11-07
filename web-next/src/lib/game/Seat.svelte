<script lang="ts">
	// 상대 좌석. 장수가 스톱 판단의 핵심이라 가장 크게 그린다 (DESIGN_PLAN §6.1-5).
	import Icon from '#lib/ui/Icon.svelte';
	import PlayingCard from './PlayingCard.svelte';

	export interface SeatInfo {
		id: number;
		name: string;
		count: number;
		registered: boolean;
		/** 방금 한 행동 한 줄. */
		last?: string;
		/** 봇 특징. 있으면 좌석을 누르거나 마우스를 올려 볼 수 있다. */
		about?: string;
	}
	interface Props {
		seat: SeatInfo;
		active?: boolean;
		/** 좌석이 많아 휴대폰에서 폭이 좁을 때. */
		compact?: boolean;
	}
	let { seat, active = false, compact = false }: Props = $props();

	/** 3장 이하면 스톱을 생각할 때다. */
	const warn = $derived(seat.count <= 3);

	let aboutOpen = $state(false);
	const isMouse = (e: Event) => (e as PointerEvent).pointerType === 'mouse';
</script>

<article
	class={['seat', active && 'active', warn && 'warn', compact && 'compact', seat.about && 'bot']}
	data-zone={`seat-${seat.id}`}
	aria-label={`${seat.name}, 손패 ${seat.count}장${seat.registered ? ', 등록함' : ''}${active ? ', 차례' : ''}`}
>
	<div class="top">
		<span class="name">{seat.name}</span>
		{#if seat.registered}
			<span class="reg"><Icon name="check" size={14} />등록</span>
		{/if}
	</div>
	<div class="count">
		<PlayingCard size="xs" />
		<span class="num" data-testid={`seat-count-${seat.id}`}>{seat.count}</span>
		<span class="unit">장</span>
		{#if warn}<span class="alert"><Icon name="warning" size={18} /></span>{/if}
	</div>
	<p class="last">{seat.last ?? ''}</p>
	{#if seat.about}
		<!-- 터치에는 호버가 없으므로 좌석 전체를 눌러 연다 -->
		<button
			type="button"
			class="about"
			aria-label={`${seat.name} 특징: ${seat.about}`}
			aria-expanded={aboutOpen}
			data-testid={`seat-about-${seat.id}`}
			onclick={(e) => {
				if (!isMouse(e)) aboutOpen = !aboutOpen;
			}}
			onpointerenter={(e) => {
				if (isMouse(e)) aboutOpen = true;
			}}
			onpointerleave={(e) => {
				if (isMouse(e)) aboutOpen = false;
			}}
			onblur={() => (aboutOpen = false)}
			onkeydown={(e) => {
				if (e.key === 'Escape') aboutOpen = false;
			}}
		></button>
		{#if aboutOpen}
			<span class="tip" role="tooltip" data-testid={`seat-tip-${seat.id}`}>{seat.about}</span>
		{/if}
	{/if}
</article>

<style>
	.seat {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		padding: 8px 12px;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
	}
	.active::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		box-shadow: inset 0 0 0 2px var(--md-sys-color-tertiary);
		pointer-events: none;
	}
	/* 전역 모션 줄이기는 길이만 줄여 무한 반복이 깜빡이므로, 켜진 경우에만 펄스한다 */
	@media (prefers-reduced-motion: no-preference) {
		.active::after {
			animation: pulse 1.4s var(--md-sys-motion-easing-standard) infinite alternate;
		}
	}
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 20px;
	}
	.name {
		overflow: hidden;
		font-size: var(--md-sys-typescale-label-large-size);
		font-weight: 700;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.reg {
		display: inline-flex;
		align-items: center;
		flex: none;
		gap: 2px;
		font-size: var(--md-sys-typescale-label-small-size);
		color: var(--md-sys-color-primary);
	}
	.count {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.num {
		font-size: var(--md-sys-typescale-headline-medium-size);
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.unit {
		align-self: flex-end;
		font-size: var(--md-sys-typescale-label-medium-size);
		color: var(--md-sys-color-on-surface-variant);
	}
	.alert {
		display: inline-flex;
		color: var(--md-sys-color-tertiary);
	}
	.warn .num {
		color: var(--md-sys-color-tertiary);
	}
	.last {
		margin: 4px 0 0;
		/* 비어 있어도 줄 높이를 유지해 아래 펠트가 움직이지 않는다 */
		min-height: var(--md-sys-typescale-body-small-line-height);
		overflow: hidden;
		font-size: var(--md-sys-typescale-body-small-size);
		line-height: var(--md-sys-typescale-body-small-line-height);
		color: var(--md-sys-color-on-surface-variant);
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	/* 휴대폰: 세로 공간을 아낀다. 장수는 오른쪽에 크게 둔다 */
	@media (max-width: 600px) {
		.seat {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			column-gap: 4px;
			padding: 6px 10px;
		}
		.count {
			grid-column: 2;
			grid-row: 1 / span 2;
			gap: 2px;
			margin: 0;
		}
		.count :global(.card) {
			display: none;
		}
		.last {
			grid-column: 1;
			margin: 0;
		}
		/* 좌석이 4개면 폭이 좁아 이름이 잘린다: 이름과 장수를 위아래로 놓고, 방금 한 행동은 기록에 맡긴다 */
		.compact {
			grid-template-columns: minmax(0, 1fr);
			padding: 6px;
		}
		.compact .name {
			font-size: var(--md-sys-typescale-label-medium-size);
		}
		.compact .count {
			grid-column: 1;
			grid-row: 2;
		}
		.compact .num {
			font-size: var(--md-sys-typescale-title-large-size);
		}
		.compact .reg {
			font-size: 0;
		}
		.compact .last {
			display: none;
		}
	}
	.bot .name {
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}
	.about {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		border-radius: inherit;
		background: none;
		cursor: help;
	}
	.tip {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 50;
		width: max-content;
		max-width: 220px;
		padding: 4px 8px;
		border-radius: var(--md-sys-shape-corner-extra-small);
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		font-size: var(--md-sys-typescale-body-small-size);
		line-height: var(--md-sys-typescale-body-small-line-height);
		pointer-events: none;
	}
	/* 오른쪽 좌석의 말풍선은 화면 밖으로 나가지 않게 오른쪽에 맞춘다 */
	.seat:nth-child(n + 2):nth-last-child(-n + 2) .tip {
		right: 0;
		left: auto;
	}
	@keyframes pulse {
		from {
			opacity: 1;
		}
		to {
			opacity: 0.35;
		}
	}
</style>
