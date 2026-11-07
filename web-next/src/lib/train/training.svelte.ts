// 훈련 세션의 상태와 진행. 틀린 문제는 3문제 뒤에 다시 나오고 오답 노트에도 쌓인다.
// 라우트를 옮겨도 이어지도록 모듈 하나로 둔다. 저장 형식은 기존 앱과 같다.
import type { CardId } from '#lib/game/cards.ts';
import { loadEngine, puzzle as requestPuzzle } from '#lib/engine.ts';
import { loadStore, saveStore, type Store } from '#lib/store.ts';
import {
	PUZZLE_KINDS,
	type DrillId,
	type DrillStats,
	type NotebookItem,
	type Puzzle,
	type PuzzleKind
} from './drills.ts';

const SESSION_LEN = 10;
const RETRY_GAP = 3;
const MAX_NOTEBOOK = 200;
const PREFETCH = 2;

export type SessionKind = DrillId | 'mix';

export type Question =
	| { type: PuzzleKind; puzzle: Puzzle; retry: boolean; id: number }
	| { type: 'notebook'; puzzle: NotebookItem; retry: boolean; id: number };

export interface Bar {
	text: string;
	percent: number;
	mine: boolean;
	best: boolean;
}

export interface RuleRow {
	card: CardId;
	points: number;
	outs: number;
	score: number;
	mine: boolean;
	best: boolean;
}

export interface Feedback {
	ok: boolean;
	title: string;
	lines: string[];
	/** 조합 찾기: 최선의 묶음. */
	bestMelds?: CardId[][];
	/** 버릴 카드: 규칙 점수표. */
	rule?: RuleRow[];
	/** 추정 승률 막대. */
	bars?: Bar[];
	seconds: number;
}

export interface Summary {
	kind: SessionKind;
	correct: number;
	total: number;
	seconds: number;
	byDrill: { type: DrillId; ok: number; n: number }[];
}

interface Retry {
	type: PuzzleKind;
	puzzle: Puzzle;
	due: number;
}

interface ResultEntry {
	type: DrillId;
	ok: boolean;
	ms: number;
}

const emptyStats = (): DrillStats => ({ n: 0, correct: 0, streak: 0, best: 0, recent: [] });
const today = () => new Date().toISOString().slice(0, 10);

class Training {
	stats = $state.raw<Record<DrillId, DrillStats>>({
		meld: emptyStats(),
		thankyou: emptyStats(),
		stop: emptyStats(),
		discard: emptyStats(),
		notebook: emptyStats()
	});
	notebookCount = $state(0);
	/** 오답 노트 중 복기에서 온 문제 수. */
	fromReviewCount = $state(0);
	todayDone = $state.raw({ n: 0, correct: 0 });

	/** 세션 중이면 true. 끝나면 summary를 보여 준다. */
	active = $state(false);
	plan = $state.raw<DrillId[]>([]);
	results = $state.raw<ResultEntry[]>([]);
	retriesLeft = $state(0);
	question = $state.raw<Question | null>(null);
	feedback = $state.raw<Feedback | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	summary = $state.raw<Summary | null>(null);

	/** 지금 문제의 제출 동작 (Enter). */
	submit: (() => void) | null = null;
	/** 지금 문제의 보기 선택 (숫자 키). */
	choose: ((index: number) => void) | null = null;

	private store: Store | null = null;
	private kind: SessionKind = 'mix';
	private index = 0;
	private retries: Retry[] = [];
	private usedNotes = new Set<string>();
	private startedAt = 0;
	private questionId = 0;
	private generation = 0;
	private queues: Partial<Record<PuzzleKind, Promise<Puzzle | { error: string }>[]>> = {};

	hydrate() {
		this.store ??= loadStore();
		this.sync();
	}

	/** 최근 정답률. 아직 안 풀었으면 null. */
	recentAccuracy(type: DrillId): number | null {
		const recent = this.stats[type].recent;
		return recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
	}

	/** 추천할 약한 유형 (최근 정답률 85% 미만 중 가장 낮은 것). */
	get weakest(): { type: PuzzleKind; accuracy: number } | null {
		let weakest: { type: PuzzleKind; accuracy: number } | null = null;
		for (const type of PUZZLE_KINDS) {
			const accuracy = this.recentAccuracy(type);
			if (accuracy !== null && (!weakest || accuracy < weakest.accuracy)) {
				weakest = { type, accuracy };
			}
		}
		return weakest && weakest.accuracy < 0.85 ? weakest : null;
	}

	start(kind: SessionKind) {
		this.hydrate();
		const notes = this.notebook.length;
		const plan: DrillId[] =
			kind === 'mix'
				? this.mixPlan()
				: Array<DrillId>(kind === 'notebook' ? Math.min(SESSION_LEN, notes) : SESSION_LEN).fill(
						kind
					);
		if (!plan.length) return;
		this.generation++;
		this.kind = kind;
		this.plan = plan;
		this.index = 0;
		this.results = [];
		this.retries = [];
		this.retriesLeft = 0;
		this.usedNotes = new Set();
		this.summary = null;
		this.active = true;
		for (const type of PUZZLE_KINDS) if (plan.includes(type)) this.prefetch(type);
		// 조합 검사는 메인 스레드 엔진으로 한다
		if (plan.includes('meld')) void loadEngine();
		void this.next();
	}

	exit() {
		this.generation++;
		this.active = false;
		this.question = null;
		this.feedback = null;
		this.summary = null;
		this.error = null;
		this.loading = false;
		this.submit = null;
		this.choose = null;
		this.sync();
	}

	async next(): Promise<void> {
		const generation = this.generation;
		this.feedback = null;
		this.error = null;
		this.submit = null;
		this.choose = null;

		let type: DrillId;
		let puzzle: Puzzle | NotebookItem | undefined;
		let retry = false;
		const due = this.retries.findIndex((r) => r.due <= this.index);
		if (due >= 0) {
			({ type, puzzle } = this.retries.splice(due, 1)[0]);
			retry = true;
		} else if (this.index < this.plan.length) {
			type = this.plan[this.index];
		} else if (this.retries.length) {
			({ type, puzzle } = this.retries.shift()!);
			retry = true;
		} else {
			this.finish();
			return;
		}
		this.retriesLeft = this.retries.length;

		if (!puzzle) {
			if (type === 'notebook') {
				puzzle = this.pickNote();
				if (!puzzle) {
					this.index++;
					return this.next();
				}
			} else {
				this.loading = true;
				this.question = null;
				const made = await this.take(type);
				if (generation !== this.generation) return;
				this.loading = false;
				if ('error' in made) {
					// 이 문제는 건너뛴다
					this.index++;
					this.error = made.error;
					return;
				}
				puzzle = made;
			}
		}
		if (!retry) this.index++;
		this.startedAt = Date.now();
		this.question = { type, puzzle, retry, id: ++this.questionId } as Question;
	}

	/** 문제에 답했다. 기록하고 피드백을 띄운다. */
	answer(result: Omit<Feedback, 'seconds'>) {
		const question = this.question;
		if (!question || this.feedback) return;
		const ms = Date.now() - this.startedAt;
		this.record(question.type, result.ok, !question.retry);
		if (!question.retry) {
			this.results = [...this.results, { type: question.type, ok: result.ok, ms }];
		}
		if (question.type === 'notebook') {
			this.updateNote(question.puzzle, result.ok);
		} else if (!result.ok) {
			if (!question.retry) {
				this.retries.push({
					type: question.type,
					puzzle: question.puzzle,
					due: this.index + RETRY_GAP
				});
			}
			this.saveWrong(question.puzzle);
		}
		this.retriesLeft = this.retries.length;
		this.save();
		this.feedback = { ...result, seconds: ms / 1000 };
	}

	// ---------- 내부 ----------

	private get notebook(): NotebookItem[] {
		return (this.store!.notebook ??= []);
	}

	private save() {
		if (this.store) saveStore(this.store);
		this.sync();
	}

	/** 저장된 기록을 화면 상태로 옮긴다. */
	private sync() {
		const store = this.store;
		if (!store) return;
		const train = (store.train ??= {} as Record<DrillId, DrillStats>);
		for (const type of [...PUZZLE_KINDS, 'notebook'] as DrillId[]) train[type] ??= emptyStats();
		this.stats = { ...train };
		this.notebookCount = store.notebook?.length ?? 0;
		this.fromReviewCount = store.notebook?.filter((n) => n.key.includes('#')).length ?? 0;
		this.todayDone = { ...(store.trainDays?.[today()] ?? { n: 0, correct: 0 }) };
	}

	private prefetch(type: PuzzleKind) {
		const queue = (this.queues[type] ??= []);
		while (queue.length < PREFETCH) {
			queue.push(requestPuzzle(type).catch((e: unknown) => ({ error: String(e) })));
		}
	}

	private take(type: PuzzleKind) {
		this.prefetch(type);
		const made = this.queues[type]!.shift()!;
		this.prefetch(type);
		return made;
	}

	/** 약한 유형이 더 자주 나온다. 오답 노트가 있으면 4문제마다 하나씩 섞는다. */
	private mixPlan(): DrillId[] {
		const weight = (type: PuzzleKind) => {
			const accuracy = this.recentAccuracy(type);
			return 1 + (accuracy === null ? 1 : (1 - accuracy) * 3);
		};
		const hasNotes = this.notebook.length > 0;
		const plan: DrillId[] = [];
		for (let i = 0; i < SESSION_LEN; i++) {
			if (hasNotes && i % 4 === 3) {
				plan.push('notebook');
				continue;
			}
			const total = PUZZLE_KINDS.reduce((sum, type) => sum + weight(type), 0);
			let x = Math.random() * total;
			plan.push(PUZZLE_KINDS.find((type) => (x -= weight(type)) < 0) ?? 'meld');
		}
		return plan;
	}

	private pickNote(): NotebookItem | undefined {
		const fresh = this.notebook.filter((n) => !this.usedNotes.has(n.key));
		fresh.sort((a, b) => (a.solved ?? 0) - (b.solved ?? 0) || (a.at < b.at ? -1 : 1));
		if (fresh[0]) this.usedNotes.add(fresh[0].key);
		return fresh[0];
	}

	private record(type: DrillId, ok: boolean, firstTry: boolean) {
		const store = this.store!;
		const stat = store.train![type];
		if (firstTry) {
			stat.n++;
			if (ok) stat.correct++;
			stat.recent.push(ok ? 1 : 0);
			if (stat.recent.length > 30) stat.recent.shift();
		}
		stat.streak = ok ? stat.streak + 1 : 0;
		stat.best = Math.max(stat.best, stat.streak);
		const days = (store.trainDays ??= {});
		const day = (days[today()] ??= { n: 0, correct: 0 });
		if (firstTry) {
			day.n++;
			if (ok) day.correct++;
		}
	}

	/** 두 번 맞히면 오답 노트에서 뺀다. */
	private updateNote(note: NotebookItem, ok: boolean) {
		note.solved = (note.solved ?? 0) + (ok ? 1 : 0);
		if (note.solved >= 2) {
			const at = this.notebook.indexOf(note);
			if (at >= 0) this.notebook.splice(at, 1);
		}
	}

	/** 생성 문제도 오답 노트에 보관한다 (선택지로 다시 풀 수 있는 유형만). */
	private saveWrong(puzzle: Puzzle) {
		const base = {
			key: `p-${Date.now()}`,
			obs: puzzle.obs,
			at: new Date().toISOString(),
			solved: 0
		};
		if (puzzle.type === 'discard') {
			this.notebook.push({
				...base,
				scored: puzzle.scored.slice(0, 5),
				best: puzzle.scored[0].action,
				lines: ['훈련 · 버릴 카드에서 틀린 장면'],
				category: 'discard'
			});
		} else if (puzzle.type === 'stop') {
			const { table } = puzzle;
			const stop = {
				action: 'stop',
				value: table.stop ? 1 : 0,
				gap: table.stop ? 0 : 1,
				gap_se: 0
			};
			const draw = {
				action: 'draw',
				value: table.stop ? 0 : 1,
				gap: table.stop ? 1 : 0,
				gap_se: 0
			};
			this.notebook.push({
				...base,
				scored: table.stop ? [stop, draw] : [draw, stop],
				best: table.stop ? 'stop' : 'draw',
				lines: [
					`스톱 기준표: 상대 최소 ${table.fewest}장 → ${table.limit === null ? '스톱 금지' : `${table.limit}점 이하 스톱`}.`
				],
				category: 'stop'
			});
		}
		if (this.notebook.length > MAX_NOTEBOOK) {
			this.notebook.splice(0, this.notebook.length - MAX_NOTEBOOK);
		}
	}

	private finish() {
		const results = this.results;
		const byDrill = new Map<DrillId, { type: DrillId; ok: number; n: number }>();
		for (const r of results) {
			const entry = byDrill.get(r.type) ?? { type: r.type, ok: 0, n: 0 };
			entry.n++;
			if (r.ok) entry.ok++;
			byDrill.set(r.type, entry);
		}
		this.summary = {
			kind: this.kind,
			correct: results.filter((r) => r.ok).length,
			total: results.length,
			seconds: results.reduce((sum, r) => sum + r.ms, 0) / Math.max(1, results.length) / 1000,
			byDrill: [...byDrill.values()]
		};
		this.question = null;
		this.feedback = null;
		this.sync();
	}
}

export const training = new Training();
