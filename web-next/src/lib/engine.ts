// WASM 엔진(hoola-wasm) 로더. 엔진 산출물은 빌드 때 static/pkg/로 복사된다 (CI: wasm-pack).
//
// - 가벼운 호출(합법 수, 관측)은 메인 스레드의 `loadEngine()`으로 한다.
// - 무거운 계산(봇 대전, L3 분석, 문제 생성)은 워커에서 한다 (`engine.worker.ts`).
import { asset } from '$app/paths';
import type { HintMove, WorkerRequest, WorkerResponse } from './engine.worker.ts';
import type { Observation } from './play/actions.ts';
import type { Puzzle, PuzzleKind } from './train/drills.ts';

export type { HintMove };

/** 엔진의 한 판 (hoola-wasm `WasmGame`) 중 이 앱이 쓰는 부분. JSON은 문자열로 주고받는다. */
export interface WasmGame {
	readonly numPlayers: number;
	readonly currentPlayer: number;
	readonly phase: 'turn_start' | 'meld' | 'over';
	readonly isOver: boolean;
	readonly actionCount: number;
	legalActions(): string;
	apply(action: string): void;
	observation(seat: number): string;
	outcome(): string;
	botAction(spec: string, seed: number): string;
	lastAction(): string | undefined;
	replayJson(): string;
	rewind(n: number): WasmGame;
	free(): void;
}

export interface Engine {
	version(): string;
	/** 카드들이 조합이면 종류, 아니면 없음. */
	meldKind(cards: string): string | undefined;
	WasmGame: new (players: number, seed: number, firstPlayer: number, rulesToml: string) => WasmGame;
}

interface EngineModule extends Engine {
	default: (input?: unknown) => Promise<unknown>;
}

/** 런타임에 정해지는 정적 파일 경로 (타입 생성 시점에는 static/pkg가 없을 수 있다). */
const staticUrl = (file: string) => asset(file as Parameters<typeof asset>[0]);

/** 엔진 JS의 절대 URL (워커는 페이지와 기준 경로가 달라서 절대 URL로 넘긴다). */
export const enginePkgUrl = () => new URL(staticUrl('/pkg/hoola_wasm.js'), location.href).href;

let loading: Promise<Engine> | null = null;

/** 메인 스레드용 엔진을 한 번만 불러온다. 첫 화면은 엔진 없이 그리고, 필요할 때 기다린다. */
export function loadEngine(): Promise<Engine> {
	loading ??= (async () => {
		const mod = (await import(/* @vite-ignore */ enginePkgUrl())) as EngineModule;
		await mod.default();
		return mod;
	})().catch((e) => {
		// 망이 잠깐 끊긴 실패를 붙들고 있으면 새로고침 전까지 다시 시도할 수 없다
		loading = null;
		throw e;
	});
	return loading;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (r: WorkerResponse) => void>();

function engineWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
		pending.get(e.data.id)?.(e.data);
		// 복기는 결정마다 한 번씩 응답한다
		if (!(e.data.ok && e.data.kind === 'reviewItem')) pending.delete(e.data.id);
	};
	return worker;
}

export interface SelfTest {
	version: string;
	moves: number;
	reason: string;
	ms: number;
}

/** 엔진 동작 확인 (워커): 전문가 봇 2명이 한 판을 끝까지 둔다. */
export function selfTest(seed = 2026): Promise<SelfTest> {
	const id = ++nextId;
	return new Promise((resolve, reject) => {
		pending.set(id, (r) => {
			if (r.ok && r.kind === 'selfTest') resolve(r);
			else reject(new Error(r.ok ? '응답 종류가 다르다' : r.error));
		});
		const req: WorkerRequest = { id, kind: 'selfTest', pkgUrl: enginePkgUrl(), seed };
		engineWorker().postMessage(req);
	});
}

/** L3 힌트 (워커): 지금까지의 기보로 판을 복원해 수마다 추정 승률을 낸다. */
export function hint(
	replay: string,
	k: number,
	seed: number
): Promise<{ scored: HintMove[]; expert: string }> {
	const id = ++nextId;
	return new Promise((resolve, reject) => {
		pending.set(id, (r) => {
			if (r.ok && r.kind === 'hint') resolve(r);
			else reject(new Error(r.ok ? '응답 종류가 다르다' : r.error));
		});
		const req: WorkerRequest = { id, kind: 'hint', pkgUrl: enginePkgUrl(), replay, k, seed };
		engineWorker().postMessage(req);
	});
}

/** 판 복기 (워커): 결정마다 평가 결과를 보낸다. 돌려준 함수를 부르면 멈춘다. */
export function reviewGame(
	replay: string,
	decisions: { index: number; action: string }[],
	k: number,
	seat: number,
	on: {
		onItem: (i: number, item: { obs: Observation; scored?: HintMove[] }) => void;
		onDone: () => void;
		onError: (message: string) => void;
	}
): () => void {
	const id = ++nextId;
	pending.set(id, (r) => {
		if (!r.ok) on.onError(r.error);
		else if (r.kind === 'reviewItem') on.onItem(r.i, r);
		else on.onDone();
	});
	const req: WorkerRequest = {
		id,
		kind: 'review',
		pkgUrl: enginePkgUrl(),
		replay,
		decisions,
		k,
		seat
	};
	engineWorker().postMessage(req);
	return () => {
		pending.delete(id);
		const cancel: WorkerRequest = { id: ++nextId, kind: 'cancel', target: id };
		engineWorker().postMessage(cancel);
	};
}

/** 훈련 문제 하나를 만든다 (워커). */
export function puzzle(type: PuzzleKind): Promise<Puzzle> {
	const id = ++nextId;
	return new Promise((resolve, reject) => {
		pending.set(id, (r) => {
			if (r.ok && r.kind === 'puzzle') resolve(r.puzzle);
			else reject(new Error(r.ok ? '응답 종류가 다르다' : r.error));
		});
		const req: WorkerRequest = { id, kind: 'puzzle', pkgUrl: enginePkgUrl(), puzzle: type };
		engineWorker().postMessage(req);
	});
}
