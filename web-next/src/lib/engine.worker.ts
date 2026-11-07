/// <reference lib="webworker" />
// 엔진 계산 전용 워커: 무거운 계산(봇 대전, 분석, 문제 생성)은 메인 스레드를 막지 않도록 여기서 한다.
import type { Observation } from './play/actions.ts';
import type { Puzzle, PuzzleKind } from './train/drills.ts';
import { generatePuzzle, type PuzzleEngine } from './train/generate.ts';

interface WorkerGame {
	readonly isOver: boolean;
	readonly currentPlayer: number;
	readonly actionCount: number;
	apply(action: string): void;
	botAction(spec: string, seed: number): string;
	evaluate(k: number, seed: number): string;
	legalActions(): string;
	observation(seat: number): string;
	rewind(n: number): WorkerGame;
	outcome(): string;
	free(): void;
}

interface WorkerEngine {
	bestPartition(cards: string): string;
	default: (input?: unknown) => Promise<unknown>;
	version(): string;
	WasmGame: {
		new (players: number, seed: number, firstPlayer: number, rulesToml: string): WorkerGame;
		fromReplay(json: string): WorkerGame;
	};
}

/** L3 평가 한 수. gap은 1위와의 차이, gap_se는 그 표준오차다. */
export interface HintMove {
	action: string;
	value: number;
	gap: number;
	gap_se: number;
}

export type WorkerRequest =
	| { id: number; kind: 'selfTest'; pkgUrl: string; seed: number }
	| { id: number; kind: 'hint'; pkgUrl: string; replay: string; k: number; seed: number }
	| { id: number; kind: 'puzzle'; pkgUrl: string; puzzle: PuzzleKind; seed?: undefined }
	| {
			id: number;
			kind: 'review';
			pkgUrl: string;
			replay: string;
			decisions: { index: number; action: string }[];
			k: number;
			seat: number;
			seed?: undefined;
	  }
	| { id: number; kind: 'cancel'; target: number; pkgUrl?: undefined; seed?: undefined };
export type WorkerResponse =
	| {
			id: number;
			ok: true;
			kind: 'selfTest';
			version: string;
			moves: number;
			reason: string;
			ms: number;
	  }
	| { id: number; ok: true; kind: 'hint'; scored: HintMove[]; expert: string }
	| { id: number; ok: true; kind: 'puzzle'; puzzle: Puzzle }
	| { id: number; ok: true; kind: 'reviewItem'; i: number; obs: Observation; scored?: HintMove[] }
	| { id: number; ok: true; kind: 'reviewDone' }
	| { id: number; ok: false; error: string };

let engine: Promise<WorkerEngine> | null = null;
const cancelled = new Set<number>();

function load(pkgUrl: string): Promise<WorkerEngine> {
	engine ??= (async () => {
		const mod = (await import(/* @vite-ignore */ pkgUrl)) as WorkerEngine;
		await mod.default();
		return mod;
	})();
	return engine;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
	const req = e.data;
	if (req.kind === 'cancel') {
		cancelled.add(req.target);
		return;
	}
	const { id, pkgUrl, seed } = req;
	try {
		const mod = await load(pkgUrl);
		if (req.kind === 'puzzle') {
			const puzzle = generatePuzzle(mod as unknown as PuzzleEngine, req.puzzle);
			self.postMessage({ id, ok: true, kind: 'puzzle', puzzle } satisfies WorkerResponse);
			return;
		}
		if (req.kind === 'review') {
			const game = mod.WasmGame.fromReplay(req.replay);
			try {
				for (let i = 0; i < req.decisions.length; i++) {
					// 사이사이 다른 요청(힌트·문제 생성·취소)을 받는다
					await new Promise((next) => setTimeout(next));
					if (cancelled.delete(id)) return;
					const { index } = req.decisions[i];
					const at = game.rewind(index);
					try {
						const legal = JSON.parse(at.legalActions()) as string[];
						const obs = JSON.parse(at.observation(req.seat)) as Observation;
						const scored =
							legal.length < 2
								? undefined
								: (JSON.parse(at.evaluate(req.k, index * 7 + 11)) as HintMove[]);
						self.postMessage({
							id,
							ok: true,
							kind: 'reviewItem',
							i,
							obs,
							scored
						} satisfies WorkerResponse);
					} finally {
						at.free();
					}
				}
				self.postMessage({ id, ok: true, kind: 'reviewDone' } satisfies WorkerResponse);
			} finally {
				game.free();
			}
			return;
		}
		if (req.kind === 'hint') {
			const game = mod.WasmGame.fromReplay(req.replay);
			try {
				const res: WorkerResponse = {
					id,
					ok: true,
					kind: 'hint',
					scored: JSON.parse(game.evaluate(req.k, req.seed)) as HintMove[],
					expert: game.botAction('expert', 0)
				};
				self.postMessage(res);
			} finally {
				game.free();
			}
			return;
		}
		const started = performance.now();
		const game = new mod.WasmGame(2, seed!, seed! % 2, '');
		try {
			while (!game.isOver) game.apply(game.botAction('expert', game.currentPlayer));
			const outcome = JSON.parse(game.outcome()) as { reason: string };
			const res: WorkerResponse = {
				id,
				ok: true,
				kind: 'selfTest',
				version: mod.version(),
				moves: game.actionCount,
				reason: outcome.reason,
				ms: performance.now() - started
			};
			self.postMessage(res);
		} finally {
			game.free();
		}
	} catch (err) {
		self.postMessage({ id, ok: false, error: String(err) } satisfies WorkerResponse);
	}
};
