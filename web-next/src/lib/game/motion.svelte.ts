// 카드 모션: 컨테이너 사이 비행(send/receive), 손패 재정렬(flip), 봇이 받은 뒷면 카드(ghost).
// transform과 opacity만 움직인다. 모션 줄이기면 모두 즉시 끝난다.
// svelte의 crossfade는 두 카드를 함께 흐리게 하는데, 카드는 불투명하게 날아야 해서 같은 구조로 직접 만든다.
import { prefersReducedMotion } from 'svelte/motion';
import { linearEasing, springCurve, type SpringCurve } from '#lib/theme/motion.ts';
import { SPRINGS } from '#lib/theme/springs.ts';

type Easing = (t: number) => number;
interface FlightConfig {
	duration: number;
	delay?: number;
	easing?: Easing;
	css?: (t: number, u: number) => string;
}
type Deferred = () => FlightConfig;

function easingOf({ points }: SpringCurve): Easing {
	const n = points.length - 1;
	return (t) => {
		const x = Math.min(Math.max(t, 0), 1) * n;
		const i = Math.min(n - 1, Math.floor(x));
		return points[i] + (points[i + 1] - points[i]) * (x - i);
	};
}

const FLIGHT = springCurve(...SPRINGS.expressive['spatial-default']);
const REFLOW = springCurve(...SPRINGS.standard['spatial-default']);
const flightEasing = easingOf(FLIGHT);
const reflowEasing = easingOf(REFLOW);
/** 날아간 원본 카드를 숨겨 두는 시간. 짧을수록 손패가 빨리 모인다. */
const SOURCE_HIDE_MS = 50;

let speed = 1;
/** 봇 속도와 연동한다: 1 = 보통, 0.6 = 빠르게 (DESIGN_PLAN §9). */
export function setMotionSpeed(scale: number) {
	speed = scale;
}
export const scaled = (ms: number) => (prefersReducedMotion.current ? 0 : Math.round(ms * speed));

/** 요소 안의 카드 위치. 카드가 없으면 요소 자체. */
function rectOf(el: Element): DOMRect {
	return (
		el.matches('[data-card]') ? el : (el.querySelector('[data-card]') ?? el)
	).getBoundingClientRect();
}

function flight(from: DOMRect, node: Element, delay = 0): FlightConfig {
	const to = rectOf(node);
	const dx = from.left - to.left;
	const dy = from.top - to.top;
	const sx = from.width / to.width;
	const sy = from.height / to.height;
	return {
		delay,
		duration: scaled(FLIGHT.duration),
		easing: flightEasing,
		css: (t, u) =>
			`z-index:60;transform-origin:0 0;transform:translate(${u * dx}px,${u * dy}px) scale(${t + u * sx},${t + u * sy})`
	};
}

interface Origin {
	selector: string;
	delay: number;
}
const origins = new Map<string, Origin>();

/** 이 카드가 곧 나타날 때 어디서 날아올지 알려 준다 (더미, 봇 좌석처럼 카드가 안 보이던 곳). */
export function expectFrom(key: string, selector: string, delay = 0) {
	origins.set(key, { selector, delay: scaled(delay) });
}

const appearing: Deferred = () => ({
	duration: scaled(200),
	easing: flightEasing,
	css: (t) => `opacity:${t};transform:scale(${0.9 + 0.1 * t})`
});

const toSend = new Map<string, Element>();
const toReceive = new Map<string, Element>();

/** 나가는 쪽: 짝이 있으면 받는 쪽이 대신 날아가므로 자신은 바로 숨는다. */
export function send(node: Element, { key }: { key: string }): Deferred {
	toSend.set(key, node);
	return () => {
		if (toReceive.has(key)) {
			toReceive.delete(key);
			return { duration: SOURCE_HIDE_MS, css: () => 'opacity:0' };
		}
		toSend.delete(key);
		return { duration: scaled(120), css: (t) => `opacity:${t}` };
	};
}

/** 들어오는 쪽: 나간 카드나 expectFrom 위치에서 날아온다. 둘 다 없으면 제자리에서 나타난다. */
export function receive(node: Element, { key }: { key: string }): Deferred {
	toReceive.set(key, node);
	return () => {
		const origin = origins.get(key);
		origins.delete(key);
		const source = toSend.get(key);
		if (source) {
			toSend.delete(key);
			return flight(rectOf(source), node);
		}
		toReceive.delete(key);
		const originEl = origin && document.querySelector(origin.selector);
		return originEl ? flight(rectOf(originEl), node, origin.delay) : appearing();
	};
}

/** animate:flip 매개변수. */
export const reflow = () => ({ duration: scaled(REFLOW.duration), easing: reflowEasing });

export interface Ghost {
	id: number;
	from: string;
	to: string;
}
/** 지금 날고 있는 뒷면 카드. <GhostLayer />가 그린다. */
export const ghosts = $state<Ghost[]>([]);
let nextGhost = 0;

/** 앞면을 보여 주면 안 되는 이동(봇이 더미에서 받기)을 뒷면 카드로 보여 준다. */
export function flyBack(from: string, to: string) {
	if (!prefersReducedMotion.current) ghosts.push({ id: ++nextGhost, from, to });
}

const GHOST_EASING = linearEasing(FLIGHT);

/** 고스트 요소를 도착 위치에 놓고 출발 위치에서 날려 보낸 뒤 목록에서 지운다. */
export function ghostFlight(node: HTMLElement, ghost: Ghost) {
	const done = () => {
		const i = ghosts.findIndex((g) => g.id === ghost.id);
		if (i >= 0) ghosts.splice(i, 1);
	};
	const fromEl = document.querySelector(ghost.from);
	const toEl = document.querySelector(ghost.to);
	if (!fromEl || !toEl) {
		queueMicrotask(done);
		return;
	}
	const from = rectOf(fromEl);
	const to = rectOf(toEl);
	node.style.left = `${to.left}px`;
	node.style.top = `${to.top}px`;
	const box = node.getBoundingClientRect();
	const anim = node.animate(
		[
			{
				transformOrigin: '0 0',
				transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / box.width},${from.height / box.height})`
			},
			{
				transformOrigin: '0 0',
				transform: `scale(${to.width / box.width},${to.height / box.height})`
			}
		],
		{ duration: scaled(FLIGHT.duration), easing: GHOST_EASING }
	);
	anim.onfinish = done;
	anim.oncancel = done;
}

/** 끌던 카드를 제자리로 되돌린다. */
export function springBack(node: HTMLElement, transform: string) {
	node.animate([{ transform }, { transform: 'none' }], {
		duration: scaled(REFLOW.duration),
		easing: linearEasing(REFLOW)
	});
}
