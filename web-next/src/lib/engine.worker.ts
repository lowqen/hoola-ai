/// <reference lib="webworker" />
// 엔진 계산 전용 워커: 무거운 계산(봇 대전, 분석)은 메인 스레드를 막지 않도록 여기서 한다.

interface WorkerGame {
	readonly isOver: boolean;
	readonly currentPlayer: number;
	readonly actionCount: number;
	apply(action: string): void;
	botAction(spec: string, seed: number): string;
	outcome(): string;
	free(): void;
}

interface WorkerEngine {
	default: (input?: unknown) => Promise<unknown>;
	version(): string;
	WasmGame: new (
		players: number,
		seed: number,
		firstPlayer: number,
		rulesToml: string
	) => WorkerGame;
}

export type WorkerRequest = { id: number; kind: 'selfTest'; pkgUrl: string; seed: number };
export type WorkerResponse =
	| { id: number; ok: true; version: string; moves: number; reason: string; ms: number }
	| { id: number; ok: false; error: string };

let engine: Promise<WorkerEngine> | null = null;

function load(pkgUrl: string): Promise<WorkerEngine> {
	engine ??= (async () => {
		const mod = (await import(/* @vite-ignore */ pkgUrl)) as WorkerEngine;
		await mod.default();
		return mod;
	})();
	return engine;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
	const { id, pkgUrl, seed } = e.data;
	try {
		const mod = await load(pkgUrl);
		const started = performance.now();
		const game = new mod.WasmGame(2, seed, seed % 2, '');
		try {
			while (!game.isOver) game.apply(game.botAction('expert', game.currentPlayer));
			const outcome = JSON.parse(game.outcome()) as { reason: string };
			const res: WorkerResponse = {
				id,
				ok: true,
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
