// 누른 지점에서 퍼지는 M3 리플. 상태 레이어(.md-state > .md-layer) 안에 그린다.
// 동작 줄이기 설정이면 퍼지지 않고 상태 레이어만 남는다.

export function ripple(node: HTMLElement) {
	const reduce = matchMedia('(prefers-reduced-motion: reduce)');
	const down = (e: PointerEvent) => {
		if (reduce.matches || node.matches(':disabled, [aria-disabled="true"]')) return;
		const rect = node.getBoundingClientRect();
		const size = Math.hypot(rect.width, rect.height) * 2;
		const dot = document.createElement('span');
		dot.className = 'md-ripple';
		dot.style.width = dot.style.height = `${size}px`;
		dot.style.left = `${e.clientX - rect.left - size / 2}px`;
		dot.style.top = `${e.clientY - rect.top - size / 2}px`;
		(node.querySelector(':scope > .md-layer') ?? node).appendChild(dot);
		const anim = dot.animate(
			[
				{ transform: 'scale(0)', opacity: 0.16 },
				{ transform: 'scale(1)', opacity: 0 }
			],
			{ duration: 550, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
		);
		anim.onfinish = () => dot.remove();
	};
	node.addEventListener('pointerdown', down);
	return {
		destroy() {
			node.removeEventListener('pointerdown', down);
		}
	};
}
