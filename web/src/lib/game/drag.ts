// 카드 끌기: 포인터로 끌어 data-drop 구역에 놓는다. 6px 넘게 움직여야 끌기로 본다(그 전에는 탭).
// 놓는 구역 판정은 프레임당 한 번만 한다. 움직임은 transform만 쓴다.
// 포인터 캡처는 탭의 click 대상을 바꾸므로 쓰지 않고, 누르는 동안만 window에서 듣는다.
import { springBack } from './motion.svelte.ts';

export interface DragOptions {
	enabled: boolean;
	canDrop: (zone: string) => boolean;
	/** true를 돌려주면 놓기 성공: 카드가 그 자리에서 목적지로 날아간다. */
	onDrop: (zone: string) => boolean;
	onStart?: () => void;
	onEnd?: () => void;
}

const THRESHOLD = 6;
const CLICK_GUARD_MS = 350;

export function draggable(node: HTMLElement, initial: DragOptions) {
	let opts = initial;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let lastX = 0;
	let lastY = 0;
	let dragging = false;
	let frame = 0;
	let over: HTMLElement | null = null;
	let guardUntil = 0;

	function setOver(zone: HTMLElement | null) {
		if (zone === over) return;
		over?.removeAttribute('data-drop-over');
		zone?.setAttribute('data-drop-over', '');
		over = zone;
	}

	function hitTest() {
		frame = 0;
		for (const el of document.elementsFromPoint(lastX, lastY)) {
			const zone = el.closest<HTMLElement>('[data-drop]');
			if (zone && opts.canDrop(zone.dataset.drop!)) return setOver(zone);
		}
		setOver(null);
	}

	function stopListening() {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', cancel);
		window.removeEventListener('keydown', escape);
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		pointerId = null;
	}

	function down(e: PointerEvent) {
		if (!opts.enabled || pointerId !== null || e.button !== 0) return;
		pointerId = e.pointerId;
		startX = lastX = e.clientX;
		startY = lastY = e.clientY;
		dragging = false;
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', cancel);
		window.addEventListener('keydown', escape);
	}

	function move(e: PointerEvent) {
		if (e.pointerId !== pointerId) return;
		lastX = e.clientX;
		lastY = e.clientY;
		if (!dragging) {
			if (Math.hypot(lastX - startX, lastY - startY) < THRESHOLD) return;
			dragging = true;
			node.classList.add('dragging');
			opts.onStart?.();
		}
		node.style.transform = `translate3d(${lastX - startX}px,${lastY - startY}px,0) scale(1.08)`;
		frame ||= requestAnimationFrame(hitTest);
	}

	function finish(dropped: boolean) {
		const wasDragging = dragging;
		stopListening();
		if (!wasDragging) return;
		dragging = false;
		if (dropped) hitTest();
		const zone = dropped ? over : null;
		setOver(null);
		opts.onEnd?.();
		node.classList.remove('dragging');
		guardUntil = performance.now() + CLICK_GUARD_MS;
		// 성공하면 transform을 남겨 둔다: 비행이 놓은 자리에서 시작한다
		if (zone && opts.onDrop(zone.dataset.drop!)) return;
		const from = node.style.transform;
		node.style.transform = '';
		springBack(node, from);
	}

	function up(e: PointerEvent) {
		if (e.pointerId === pointerId) finish(true);
	}
	function cancel(e: PointerEvent) {
		if (e.pointerId === pointerId) finish(false);
	}
	function escape(e: KeyboardEvent) {
		if (e.key === 'Escape') finish(false);
	}
	/** 끌기 직후의 click은 탭이 아니다. */
	function guardClick(e: MouseEvent) {
		if (performance.now() < guardUntil) e.stopPropagation();
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('click', guardClick, { capture: true });

	return {
		update(next: DragOptions) {
			opts = next;
		},
		destroy() {
			stopListening();
			setOver(null);
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('click', guardClick, { capture: true });
		}
	};
}
