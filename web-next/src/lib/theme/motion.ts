// 감쇠 스프링을 CSS `linear()` 이징으로 바꾼다. 질량 1, x(0)=0 → 1, 초기 속도 0.

export interface SpringCurve {
	/** 정착까지 걸리는 시간 (ms). */
	duration: number;
	/** 0..duration 구간의 위치 표본 (첫 값 0, 끝 값 1). */
	points: number[];
}

/**
 * 스프링 운동을 수치 적분해 정착 시점(위치 오차 < 0.1%, 속도 작음)까지 표본을 뽑는다.
 * @param dampingRatio 감쇠비 (1 = 임계 감쇠, < 1 = 튀어 오름)
 * @param stiffness 강성 (값이 클수록 빠르다)
 */
export function springCurve(dampingRatio: number, stiffness: number, samples = 48): SpringCurve {
	const omega = Math.sqrt(stiffness);
	const c = 2 * dampingRatio * omega;
	const dt = 1 / 4000;
	let x = 0;
	let v = 0;
	let t = 0;
	const trace: [number, number][] = [[0, 0]];
	let settledAt = 0;
	for (let i = 0; i < 4000 * 5; i++) {
		const a = -stiffness * (x - 1) - c * v;
		v += a * dt;
		x += v * dt;
		t += dt;
		trace.push([t, x]);
		if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) {
			if (!settledAt) settledAt = t;
			if (t - settledAt > 0.02) break;
		} else {
			settledAt = 0;
		}
	}
	const end = settledAt || t;
	const points: number[] = [];
	for (let k = 0; k <= samples; k++) {
		const target = (end * k) / samples;
		const idx = Math.min(trace.length - 1, Math.round(target / dt));
		points.push(k === samples ? 1 : trace[idx][1]);
	}
	return { duration: Math.round(end * 1000), points };
}

/** `linear(0, 0.12, …, 1)` 문자열. */
export function linearEasing(curve: SpringCurve): string {
	return `linear(${curve.points.map((p) => +p.toFixed(4)).join(', ')})`;
}
