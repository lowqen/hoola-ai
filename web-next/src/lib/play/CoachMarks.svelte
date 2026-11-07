<script lang="ts">
	// 첫 실행 코치마크 3단계 (DESIGN_PLAN §6.4). 판을 막지 않는다: 안내를 보면서 그대로 둘 수 있다.
	import Button from '#lib/ui/Button.svelte';
	import { session } from './session.svelte.ts';

	const STEPS = [
		{
			selector: '[data-coach="mine"]',
			title: '내 손패와 점수',
			text: '점수가 낮을수록 좋다. 카드를 누르면 고르고, 두 번 누르거나 끌어서 버린다.'
		},
		{
			selector: '[data-coach="seats"]',
			title: '상대 장수',
			text: '스톱 판단의 핵심이다. 3장 이하면 경고 색으로 바뀐다.'
		},
		{
			selector: '[data-coach="actions"]',
			title: '행동 바',
			text: '버튼 자리는 항상 같다. 지금 못 하는 행동을 누르면 이유를 알려 준다.'
		}
	];

	const step = $derived(STEPS[session.coachStep - 1]);
	let rect = $state<DOMRect | null>(null);

	$effect(() => {
		if (!step) return;
		const measure = () => {
			rect = document.querySelector(step.selector)?.getBoundingClientRect() ?? null;
		};
		document.querySelector(step.selector)?.scrollIntoView({ block: 'nearest' });
		measure();
		window.addEventListener('resize', measure);
		window.addEventListener('scroll', measure, { passive: true });
		return () => {
			window.removeEventListener('resize', measure);
			window.removeEventListener('scroll', measure);
		};
	});

	/** 안내 카드는 강조한 영역을 가리지 않는 쪽에 둔다. */
	const onTop = $derived(!!rect && rect.top + rect.height / 2 > window.innerHeight / 2);

	function next() {
		if (session.coachStep < STEPS.length) session.coachStep++;
		else session.finishCoach();
	}
</script>

{#if step}
	{#if rect}
		<div
			class="ring"
			aria-hidden="true"
			style={`top:${rect.top - 4}px;left:${rect.left - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px`}
		></div>
	{/if}
	<div class={['card', onTop && 'top']} role="region" aria-label="화면 안내" data-testid="coach">
		<p class="count">{session.coachStep} / {STEPS.length}</p>
		<h2>{step.title}</h2>
		<p>{step.text}</p>
		<div class="actions">
			<Button
				variant="text"
				size="sm"
				data-testid="coach-skip"
				onclick={() => session.finishCoach()}>건너뛰기</Button
			>
			<Button size="sm" data-testid="coach-next" onclick={next}
				>{session.coachStep < STEPS.length ? '다음' : '시작하기'}</Button
			>
		</div>
	</div>
{/if}

<style>
	.ring {
		position: fixed;
		z-index: 80;
		border-radius: var(--md-sys-shape-corner-large);
		box-shadow: 0 0 0 3px var(--md-sys-color-tertiary);
		pointer-events: none;
	}
	.card {
		position: fixed;
		z-index: 81;
		left: 50%;
		bottom: calc(80px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		width: min(420px, calc(100vw - 32px));
		padding: 12px 16px;
		border-radius: var(--md-sys-shape-corner-large);
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		box-shadow: var(--md-sys-elevation-level3);
	}
	.card.top {
		top: 60px;
		bottom: auto;
	}
	h2 {
		margin: 0 0 4px;
		font-size: var(--md-sys-typescale-title-medium-size);
		font-weight: 800;
	}
	p {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	.count {
		font-size: var(--md-sys-typescale-label-small-size);
		opacity: 0.8;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
		--md-sys-color-primary: var(--md-sys-color-inverse-primary);
		--md-sys-color-on-primary: var(--md-sys-color-on-primary-fixed);
	}
</style>
