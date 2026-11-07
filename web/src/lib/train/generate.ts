// 훈련 문제 생성 (워커 전용): 봇끼리 실제로 두다가 문제 조건에 맞는 장면에서 멈추고, 엔진으로 정답을 계산한다.
import type { Observation } from '#lib/play/actions.ts';
import { STOP_TABLE } from '#lib/play/actions.ts';
import type { Puzzle, PuzzleKind, ScoredMove } from './drills.ts';

export interface PuzzleGame {
	readonly isOver: boolean;
	readonly currentPlayer: number;
	apply(action: string): void;
	botAction(spec: string, seed: number): string;
	evaluate(k: number, seed: number): string;
	legalActions(): string;
	observation(seat: number): string;
	stopTruth(seat: number): boolean;
	stopEstimate(seat: number, samples: number, seed: number): number;
	handPoints(): ArrayLike<number>;
	free(): void;
}

export interface PuzzleEngine {
	bestPartition(cards: string): string;
	WasmGame: new (
		players: number,
		seed: number,
		firstPlayer: number,
		rulesToml: string
	) => PuzzleGame;
}

const OPPONENTS = [
	'expert:stop=t3:meld=dump:outs=1', // 친구 (bots.ts의 friendE)
	'expert:stop=t3:meld=dump:outs=1',
	'expert',
	'expert:stop=never',
	'expert:stop=never:meld=allin'
];

const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const chance = (p: number) => Math.random() < p;

// 스톱 문제는 "스톱"과 "기다림" 정답이 번갈아 나오게 균형을 맞춘다
let nextStopAnswer = true;

function stopTableOf(obs: Observation) {
	const fewest = Math.min(7, ...obs.hand_counts.filter((_, seat) => seat !== 0));
	const limit = STOP_TABLE[fewest];
	return { fewest, limit, stop: limit !== null && obs.hand_points <= limit };
}

type Made = Omit<Puzzle, 'players' | 'opponent'>;

/** 장면이 문제 조건에 맞으면 문제를 만든다. */
function tryMake(
	engine: PuzzleEngine,
	kind: PuzzleKind,
	game: PuzzleGame,
	obs: Observation,
	legal: string[]
): Made | null {
	switch (kind) {
		case 'meld': {
			if (obs.phase !== 'meld' || !legal.some((a) => a.startsWith('register '))) return null;
			const answer = JSON.parse(engine.bestPartition(obs.hand.join(' ')));
			if (!answer.melds.length) return null;
			// 조합 1개짜리 쉬운 문제는 덜, 2개 이상·7·순환 런 문제는 더 자주
			const rich = answer.melds.length >= 2 || answer.melds.some((m: string[]) => m.length === 1);
			if (!chance(rich ? 0.9 : 0.35)) return null;
			return { type: kind, obs, answer } as Made;
		}
		case 'thankyou': {
			const target = obs.thank_you_target;
			if (obs.phase !== 'turn_start' || !target) return null;
			const options = legal.filter((a) => a.startsWith('thankyou '));
			if (options.length) {
				if (!chance(0.85)) return null;
			} else {
				// 정답이 "땡큐 불가"인 문제: 같은 숫자나 같은 무늬 근처 카드가 있어 헷갈리는 장면만
				const tempting = obs.hand.some(
					(c) => c.slice(0, -1) === target.slice(0, -1) || c.slice(-1) === target.slice(-1)
				);
				if (!tempting || !chance(0.3)) return null;
			}
			return { type: kind, obs, options } as Made;
		}
		case 'stop': {
			if (obs.phase !== 'turn_start' || !legal.includes('stop')) return null;
			const table = stopTableOf(obs);
			if (table.stop !== nextStopAnswer && !chance(0.08)) return null;
			nextStopAnswer = !nextStopAnswer;
			return {
				type: kind,
				obs,
				table,
				truth: game.stopTruth(0),
				estimate: game.stopEstimate(0, 400, rand32()),
				points: Array.from(game.handPoints())
			} as Made;
		}
		case 'discard': {
			if (obs.phase !== 'meld' || obs.hand.length < 4) return null;
			if (!legal.every((a) => a.startsWith('discard '))) return null;
			if (!chance(0.5)) return null;
			const scored = JSON.parse(game.evaluate(128, rand32())) as ScoredMove[];
			// 뚜렷하게 나쁜 버림이 있는 장면만 (아무거나 버려도 되는 문제는 뺀다)
			if (!scored.some((v) => v.gap > 2 * v.gap_se && v.gap >= 0.03)) return null;
			return { type: kind, obs, scored } as Made;
		}
	}
}

export function generatePuzzle(engine: PuzzleEngine, kind: PuzzleKind): Puzzle {
	for (let attempt = 0; attempt < 200; attempt++) {
		const seed = rand32();
		const players = chance(0.75) ? 2 : 3;
		const opponent = OPPONENTS[rand32() % OPPONENTS.length];
		const game = new engine.WasmGame(players, seed, seed % players, '');
		try {
			let steps = 0;
			while (!game.isOver && steps++ < 500) {
				const seat = game.currentPlayer;
				if (seat === 0) {
					const legal = JSON.parse(game.legalActions()) as string[];
					const obs = JSON.parse(game.observation(0)) as Observation;
					const made = tryMake(engine, kind, game, obs, legal);
					if (made) return { ...made, players, opponent } as Puzzle;
				}
				game.apply(game.botAction(seat === 0 ? 'expert' : opponent, seat));
			}
		} finally {
			game.free();
		}
	}
	throw new Error(`문제를 만들지 못했다: ${kind}`);
}
