// 대전 한 판의 상태와 진행. 화면은 사람 좌석의 관측만으로 그린다.
// 라우트를 옮겨도 판이 이어지도록 모듈 하나로 둔다. 저장 형식은 기존 앱과 같다.
import { cardAria, cardText, sortCards, type CardId } from '#lib/game/cards.ts';
import { expectFrom, flyBack, scaled, setMotionSpeed } from '#lib/game/motion.svelte.ts';
import type { MeldInfo } from '#lib/game/MeldGroup.svelte';
import type { SeatInfo } from '#lib/game/Seat.svelte';
import {
	hint as requestHint,
	loadEngine,
	type Engine,
	type HintMove,
	type WasmGame
} from '#lib/engine.ts';
import {
	loadStore,
	saveStore,
	type GameRecord,
	type ReviewSummary,
	type Settings,
	type Store
} from '#lib/store.ts';
import type { ReviewContext } from '#lib/review/analysis.ts';
import type { NotebookItem, PuzzleKind } from '#lib/train/drills.ts';
import { snackbar } from '#lib/ui/snackbar.svelte.ts';
import { actionText, meldOrder, parseAction, type Observation, type Outcome } from './actions.ts';
import { BOTS, DEFAULT_SETTINGS, normalizeSettings } from './bots.ts';

const HUMAN = 0;
const HINT_K = 96;
const MAX_GAMES = 500;
const MAX_NOTEBOOK = 200;
const STOCK = '[data-zone="stock"]';
const seatZone = (seat: number) => `[data-zone="seat-${seat}"]`;

interface GameConfig {
	players: number;
	opponents: string[];
	fullDiscards: boolean;
	seed: number;
}

export interface LogLine {
	id: number;
	text: string;
	kind: 'sys' | 'mine' | 'other';
}

export interface ResultHand {
	seat: number;
	name: string;
	cards: CardId[];
	points: number;
	winner: boolean;
}

export interface GameResult {
	title: string;
	tone: 'win' | 'lose' | 'draw';
	reason: string;
	cause: string | null;
	/** 원인에 맞는 훈련 유형. */
	drill: PuzzleKind | null;
	hands: ResultHand[];
}

export type HintState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| { status: 'ready'; moves: (HintMove & { text: string; isExpert: boolean })[] };

export interface Choice {
	title: string;
	options: { label: string; action: string }[];
}

function randomSeed() {
	const a = new Uint32Array(1);
	crypto.getRandomValues(a);
	return a[0];
}

class PlaySession {
	settings = $state<Settings>({ ...DEFAULT_SETTINGS });
	obs = $state.raw<Observation | null>(null);
	legal = $state.raw<string[]>([]);
	selected = $state<CardId[]>([]);
	log = $state.raw<LogLine[]>([]);
	announcement = $state('');
	result = $state.raw<GameResult | null>(null);
	hintState = $state.raw<HintState>({ status: 'idle' });
	choice = $state.raw<Choice | null>(null);
	gamesPlayed = $state(0);
	canUndo = $state(false);
	starting = $state(false);
	engineError = $state('');

	resultOpen = $state(false);
	reviewOpen = $state(false);
	newGameOpen = $state(false);
	rulesOpen = $state(false);
	hintOpen = $state(false);
	coachStep = $state(0);

	private store: Store = { settings: null, games: [] };
	private hydrated = false;
	private engine: Engine | null = null;
	private game: WasmGame | null = null;
	private config = $state.raw<GameConfig | null>(null);
	private decisions: { index: number; action: string }[] = [];
	private usedBeginner = false;
	private usedUndo = false;
	private recorded = false;
	private lastRecord: GameRecord | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	/** 지난 판·되돌리기 이전의 지연 작업을 끊는 표식. */
	private generation = 0;
	private logId = 0;
	private logged = 0;
	private undoSnackbar: number | undefined;

	/** 브라우저에서 한 번만 저장소를 읽는다. 프리렌더 HTML은 기본값으로 그린다. */
	hydrate() {
		if (this.hydrated) return;
		this.hydrated = true;
		this.store = loadStore();
		this.settings = normalizeSettings(this.store.settings);
		this.gamesPlayed = this.store.games.length;
		setMotionSpeed(this.settings.speed <= 150 ? 0.6 : 1);
	}

	saveSettings() {
		this.store.settings = $state.snapshot(this.settings);
		saveStore(this.store);
		setMotionSpeed(this.settings.speed <= 150 ? 0.6 : 1);
	}

	/** 프리셋을 고른다. 다음 판부터 적용된다. */
	choosePreset(id: string) {
		this.settings.opponents = this.settings.opponents.map(() => id);
		this.saveSettings();
	}

	// ---------- 이름 ----------
	seatName = (seat: number) => {
		if (seat === HUMAN) return '나';
		const bot = this.config && BOTS[this.config.opponents[seat - 1]];
		return `${seat}번 ${bot ? bot.short : '봇'}`;
	};

	private actText(action: string, obs: Observation) {
		return actionText(action, obs, this.seatName);
	}

	// ---------- 화면용 값 ----------
	get myTurn() {
		return !!this.obs && this.obs.current_player === HUMAN && this.obs.phase !== 'over';
	}

	get over() {
		return this.obs?.phase === 'over';
	}

	get hand(): CardId[] {
		return this.obs ? sortCards(this.obs.hand, this.settings.sort ?? 'suit') : [];
	}

	get seats(): SeatInfo[] {
		const obs = this.obs;
		if (!obs) return [];
		const last: Record<number, string> = {};
		for (const e of obs.events) if (e.action !== undefined) last[e.seat] = e.action;
		return obs.hand_counts.slice(1).map((count, i) => {
			const seat = i + 1;
			return {
				id: seat,
				name: this.seatName(seat),
				count,
				registered: obs.registered[seat],
				last: last[seat] ? this.actText(last[seat], obs) : undefined
			};
		});
	}

	get melds(): MeldInfo[] {
		return (this.obs?.melds ?? []).map((m) => ({
			id: m.index,
			kind: m.kind,
			owner: this.seatName(m.owner),
			cards: meldOrder(m)
		}));
	}

	get turn(): number | 'me' {
		const obs = this.obs;
		if (!obs || obs.phase === 'over') return -1;
		return obs.current_player === HUMAN ? 'me' : obs.current_player;
	}

	get showHistory() {
		return !!this.config?.fullDiscards;
	}

	// ---------- 진행 ----------
	/** 저장된 설정으로 새 판. 시드를 정해 두었으면 그 시드로 한다. */
	async newGame() {
		const fixed = parseInt(this.settings.seed, 10);
		await this.start(Number.isFinite(fixed) && fixed >= 0 ? fixed >>> 0 : randomSeed());
	}

	async sameGame() {
		if (this.config) await this.start(this.config.seed);
	}

	private async start(seed: number) {
		this.hydrate();
		this.starting = true;
		try {
			this.engine ??= await loadEngine();
		} catch (e) {
			this.engineError = String(e);
			return;
		} finally {
			this.starting = false;
		}
		this.stopTimers();
		const { settings } = this;
		this.config = {
			players: settings.players,
			opponents: settings.opponents.slice(0, settings.players - 1),
			fullDiscards: settings.fullDiscards,
			seed
		};
		const first = seed % settings.players;
		const rules = settings.fullDiscards ? '[visibility]\ndiscard_history = "full"\n' : '';
		this.game?.free();
		this.game = new this.engine.WasmGame(settings.players, seed, first, rules);
		this.decisions = [];
		this.usedBeginner = false;
		this.usedUndo = false;
		this.recorded = false;
		this.lastRecord = null;
		this.resetLog(`판 시작 · 시드 ${seed} · 선: ${this.seatName(first)}`);
		this.resetTurnState();
		this.newGameOpen = false;
		this.step();
		if (!settings.coached) this.coachStep = 1;
	}

	private stopTimers() {
		this.generation++;
		clearTimeout(this.timer);
		if (this.undoSnackbar !== undefined) snackbar.dismiss(this.undoSnackbar);
		this.undoSnackbar = undefined;
	}

	private resetTurnState() {
		this.selected = [];
		this.result = null;
		this.resultOpen = false;
		this.choice = null;
		this.hintState = { status: 'idle' };
		this.canUndo = this.decisions.length > 0;
	}

	private resetLog(text: string) {
		this.logged = 0;
		this.log = [{ id: ++this.logId, text, kind: 'sys' }];
	}

	private readObs() {
		return JSON.parse(this.game!.observation(HUMAN)) as Observation;
	}

	/** 관측을 화면에 반영한다. 모션 출발지는 그 전에 알려 둔다(stage). */
	private publish(obs: Observation) {
		this.obs = obs;
		this.legal = this.myTurn ? (JSON.parse(this.game!.legalActions()) as string[]) : [];
		this.selected = this.selected.filter((c) => obs.hand.includes(c));
		const added: LogLine[] = [];
		for (; this.logged < obs.events.length; this.logged++) {
			const e = obs.events[this.logged];
			if (e.reshuffle !== undefined) {
				added.push({ id: ++this.logId, text: `버림패를 섞어 더미 ${e.reshuffle}장`, kind: 'sys' });
			} else {
				added.push({
					id: ++this.logId,
					text: `${this.seatName(e.seat!)} · ${this.actText(e.action!, obs)}`,
					kind: e.seat === HUMAN ? 'mine' : 'other'
				});
			}
		}
		if (added.length) this.log = [...this.log, ...added];
	}

	/** 다음 수까지 진행한다: 끝났으면 결과, 내 차례면 대기, 봇 차례면 잠시 뒤 둔다. */
	private step() {
		clearTimeout(this.timer);
		const game = this.game!;
		this.publish(this.readObs());
		if (game.isOver) {
			this.finish();
			return;
		}
		if (game.currentPlayer === HUMAN) {
			if (this.settings.beginner && this.settings.autoHint) void this.runHint();
			return;
		}
		this.timer = setTimeout(() => {
			const seat = game.currentPlayer;
			const before = this.obs!;
			const spec = BOTS[this.config!.opponents[seat - 1]].spec;
			const action = game.botAction(spec, seat);
			game.apply(action);
			this.stage(seat, action, before);
			this.step();
		}, this.settings.speed);
	}

	/** 방금 둔 수의 카드 출발지를 알린다. 손패·바닥·버림패 사이 이동은 자동으로 날아간다. */
	private stage(seat: number, action: string, before: Observation) {
		const { verb, cards } = parseAction(action);
		if (seat === HUMAN) {
			if (verb === 'draw') {
				const drawn = this.readObs().hand.find((c) => !before.hand.includes(c));
				if (drawn) expectFrom(drawn, STOCK);
				this.announcement = drawn ? `${cardAria(drawn)}를 받았다` : '카드를 받았다';
			}
			return;
		}
		const zone = seatZone(seat);
		if (verb === 'draw') {
			flyBack(STOCK, zone);
		} else {
			cards
				.filter((c) => c !== before.discard_top || verb !== 'thankyou')
				.forEach((c, i) => expectFrom(c, zone, i * 50));
		}
		this.announcement = `${this.seatName(seat)} · ${this.actText(action, before)}`;
	}

	/** 내 행동을 시도한다. 불법이면 상태는 그대로이고 이유를 보여 준다. */
	play(action: string, failMessage = '지금은 할 수 없는 수다'): boolean {
		const game = this.game;
		if (!game || game.isOver || game.currentPlayer !== HUMAN) return false;
		const before = this.obs!;
		const index = game.actionCount;
		try {
			game.apply(action);
		} catch {
			this.notifyRule(failMessage);
			return false;
		}
		if (this.settings.beginner) this.usedBeginner = true;
		const normalized = game.lastAction() ?? action;
		this.decisions.push({ index, action: normalized });
		this.canUndo = true;
		this.selected = [];
		this.choice = null;
		this.hintState = { status: 'idle' };
		this.stage(HUMAN, normalized, before);
		this.step();
		this.offerUndo(normalized, before);
		return true;
	}

	/** 내 행동 직후 되돌리기 스낵바 (DESIGN_PLAN §6.1-6). 받기와 판 종료 때는 띄우지 않는다. */
	private offerUndo(action: string, before: Observation) {
		const { verb, cards } = parseAction(action);
		if (this.undoSnackbar !== undefined) snackbar.dismiss(this.undoSnackbar);
		this.undoSnackbar = undefined;
		if (verb === 'draw' || this.game?.isOver) return;
		const message =
			verb === 'discard'
				? `${cardText(cards[0])}를 버렸다`
				: verb === 'attach'
					? `${cardText(cards[0])}를 붙였다`
					: this.actText(action, before);
		this.announcement = message;
		this.undoSnackbar = snackbar.show({
			message,
			actionLabel: '되돌리기',
			onAction: () => this.undo()
		});
	}

	notifyRule(message: string) {
		snackbar.show({
			message,
			actionLabel: '규칙 보기',
			onAction: () => (this.rulesOpen = true)
		});
	}

	private rewindTo(index: number, note: string) {
		this.stopTimers();
		const old = this.game!;
		this.game = old.rewind(index);
		old.free();
		this.decisions = this.decisions.filter((d) => d.index < index);
		this.usedUndo = true;
		this.resetLog(note);
		this.resetTurnState();
		this.announcement = '되돌렸다';
		this.step();
	}

	undo() {
		const last = this.decisions.at(-1);
		if (this.game && last) this.rewindTo(last.index, `되돌리기 · 시드 ${this.config!.seed}`);
	}

	// ---------- 선택과 행동 ----------
	toggle(card: CardId) {
		if (this.over) return;
		this.selected = this.selected.includes(card)
			? this.selected.filter((c) => c !== card)
			: [...this.selected, card];
	}

	resort() {
		this.settings.sort = this.settings.sort === 'rank' ? 'suit' : 'rank';
		this.saveSettings();
	}

	draw() {
		this.play('draw');
	}

	stop() {
		const obs = this.obs!;
		this.play('stop', `손패 ${obs.hand_points}점: ${obs.stop_limit}점 이하일 때만 스톱할 수 있다`);
	}

	discard(card: CardId) {
		return this.play(`discard ${card}`);
	}

	register() {
		const sel = sortCards(this.selected);
		if (this.settings.beginner) return this.pick('등록', 'register ', sel);
		if (!sel.length) return this.notifyRule('등록할 카드를 고르세요');
		this.play(
			`register ${sel.join(' ')}`,
			'세트(같은 숫자 3장 이상), 런(같은 무늬 연속 3장 이상), 7 한 장만 등록할 수 있다'
		);
	}

	thankYou() {
		const obs = this.obs!;
		const sel = sortCards(this.selected);
		if (this.settings.beginner) return this.pick('땡큐', 'thankyou', sel);
		if (!obs.discard_top) return this.notifyRule('버림패가 없다');
		if (sel.length < 2)
			return this.notifyRule('버림패 맨 위 카드와 조합할 내 카드를 2장 이상 고르세요');
		this.play(
			`thankyou ${[...sel, obs.discard_top].join(' ')}`,
			'땡큐할 수 없다: 바로 앞 사람이 버린 맨 위 카드와 고른 카드가 세트나 런이 되어야 한다'
		);
	}

	attach() {
		const sel = this.selected;
		if (this.settings.beginner) return this.pick('붙이기', 'attach ', sel);
		if (sel.length !== 1)
			return this.notifyRule('붙일 카드 1장을 먼저 고른 뒤 바닥 조합을 누르세요');
		const melds = this.obs!.melds;
		if (melds.length === 1) return this.attachTo(sel[0], melds[0].index);
		this.notifyRule('바닥에서 붙일 조합을 누르세요');
	}

	attachTo(card: CardId, meld: number) {
		const message = this.obs!.registered[HUMAN]
			? '그 조합에는 붙일 수 없다'
			: '등록이나 땡큐를 한 번 한 뒤에만 붙일 수 있다';
		return this.play(`attach ${card} ${meld}`, message);
	}

	/** 초보자 모드: 합법 수 중 고른 카드에 맞는 것을 찾아, 하나면 두고 여럿이면 고르게 한다. */
	private pick(title: string, prefix: string, sel: CardId[]) {
		const obs = this.obs!;
		const all = this.legal.filter((a) => a.startsWith(prefix));
		const matching = all.filter((a) => {
			const { cards } = parseAction(a);
			return sel.every((c) => cards.includes(c));
		});
		const options = matching.length ? matching : all;
		if (options.length === 1) {
			this.play(options[0]);
			return;
		}
		this.choice = {
			title,
			options: options.map((action) => ({ label: this.actText(action, obs), action }))
		};
	}

	/** 카드 한 장을 낼 수 있는 구역. 셀프 모드는 합법 여부를 미리 알려 주지 않는다. */
	dropTargets = (card: CardId): string[] => {
		const obs = this.obs;
		if (!obs || !this.myTurn || obs.phase !== 'meld') return [];
		const melds = this.settings.beginner
			? this.legal.filter((a) => a.startsWith(`attach ${card} `)).map((a) => parseAction(a).meld!)
			: obs.melds.map((m) => m.index);
		return ['discard', ...melds.map((id) => `meld-${id}`)];
	};

	playCard = (card: CardId, zone: string): boolean => {
		if (zone === 'discard') return this.discard(card);
		return this.attachTo(card, +zone.replace('meld-', ''));
	};

	// ---------- 힌트 ----------
	async runHint() {
		const game = this.game;
		if (!this.settings.beginner || !game || game.isOver || game.currentPlayer !== HUMAN) return;
		const at = game.actionCount;
		const gen = this.generation;
		const obs = this.obs!;
		this.hintState = { status: 'loading' };
		try {
			const { scored, expert } = await requestHint(game.replayJson(), HINT_K, at + 1);
			if (gen !== this.generation || at !== this.game?.actionCount) return;
			this.hintState = {
				status: 'ready',
				moves: scored.slice(0, 6).map((m) => ({
					...m,
					text: this.actText(m.action, obs),
					isExpert: m.action === expert
				}))
			};
		} catch (e) {
			if (gen === this.generation) this.hintState = { status: 'error', message: String(e) };
		}
	}

	openHint() {
		this.hintOpen = true;
		if (this.hintState.status === 'idle') void this.runHint();
	}

	// ---------- 종료·전적 ----------
	private finish() {
		const game = this.game!;
		const out = JSON.parse(game.outcome()) as Outcome;
		const obs = this.obs!;
		const won = out.winners.includes(HUMAN);
		const name = this.seatName;
		const reasons: Record<Outcome['reason'], string> = {
			out: `${name(out.player ?? 0)} 털기`,
			'stop-success': `${name(out.caller ?? 0)} 스톱 성공`,
			'stop-fail': `${name(out.caller ?? 0)} 스톱 실패`,
			'no-cards': '받을 카드 없음',
			'turn-limit': '턴 제한'
		};
		const myPoints = out.points[HUMAN];
		this.result = {
			title:
				out.winners.length === 0
					? '무승부'
					: won
						? out.winners.length > 1
							? '공동 승리'
							: '승리'
						: '패배',
			tone: won ? 'win' : out.winners.length === 0 ? 'draw' : 'lose',
			reason: `${reasons[out.reason] ?? out.reason} · 내 손패 ${myPoints}점`,
			...(won ? { cause: null, drill: null } : this.lossCause(out, myPoints, obs.stop_limit)),
			hands: (obs.revealed_hands ?? []).map((cards, seat) => ({
				seat,
				name: name(seat),
				cards: sortCards(cards),
				points: out.points[seat],
				winner: out.winners.includes(seat)
			}))
		};
		this.record(out);
		this.announcement = `판 종료: ${this.result.title}`;
		const gen = this.generation;
		// 마지막 카드 이동을 본 뒤에 결과를 연다
		setTimeout(() => {
			if (gen === this.generation) this.resultOpen = true;
		}, scaled(450));
	}

	/** 졌을 때 한 줄 원인 추정과 다음 훈련 (DESIGN_PLAN §6.3). */
	private lossCause(
		out: Outcome,
		points: number,
		limit: number
	): { cause: string | null; drill: PuzzleKind | null } {
		const name = this.seatName;
		if (out.reason === 'stop-fail' && out.caller === HUMAN) {
			return {
				cause: '스톱했지만 나보다 낮거나 같은 손패가 있었다 → 훈련: 스톱 판단',
				drill: 'stop'
			};
		}
		if (out.reason === 'out') {
			return points > limit
				? {
						cause: `${limit}점 이하가 되기 전에 ${name(out.player ?? 0)}가 털었다 → 훈련: 조합 찾기`,
						drill: 'meld'
					}
				: {
						cause: `스톱할 수 있는 점수였는데 ${name(out.player ?? 0)}가 먼저 털었다 → 훈련: 스톱 판단`,
						drill: 'stop'
					};
		}
		if (out.reason === 'stop-success') {
			return {
				cause: `${name(out.caller ?? 0)}의 스톱에 점수로 졌다 → 훈련: 버릴 카드`,
				drill: 'discard'
			};
		}
		return { cause: null, drill: null };
	}

	private record(out: Outcome) {
		if (this.recorded) return;
		this.recorded = true;
		const config = this.config!;
		const record: GameRecord = {
			at: new Date().toISOString(),
			players: config.players,
			opponents: config.opponents,
			seed: config.seed,
			reason: out.reason,
			share: out.rewards[HUMAN],
			undo: this.usedUndo,
			beginner: this.usedBeginner,
			replay: JSON.parse(this.game!.replayJson()),
			human_seat: HUMAN
		};
		this.lastRecord = record;
		this.store.games.push(record);
		if (this.store.games.length > MAX_GAMES) {
			this.store.games.splice(0, this.store.games.length - MAX_GAMES);
		}
		saveStore(this.store);
		this.gamesPlayed = this.store.games.length;
	}

	// ---------- 복기 ----------

	get reviewPlayers() {
		return this.config?.players ?? 2;
	}

	openReview() {
		this.resultOpen = false;
		this.reviewOpen = true;
	}

	/** 닫으면 결과 시트로 돌아간다. */
	closeReview() {
		this.reviewOpen = false;
		if (this.result) this.resultOpen = true;
	}

	reviewContext(): ReviewContext | null {
		const { game, config } = this;
		if (!game || !config) return null;
		return {
			replay: game.replayJson(),
			decisions: [...this.decisions],
			seat: HUMAN,
			players: config.players,
			seatName: this.seatName,
			outcome: JSON.parse(game.outcome()) as Outcome,
			events: (JSON.parse(game.observation(HUMAN)) as Observation).events,
			key: `${config.seed}`
		};
	}

	/** 복기 요약은 전적에, 확실한 실수는 오답 노트에 쌓는다. */
	saveReview(summary: ReviewSummary, mistakes: NotebookItem[]) {
		if (this.lastRecord) this.lastRecord.review = summary;
		const notebook = (this.store.notebook ??= []);
		const have = new Set(notebook.map((m) => m.key));
		for (const m of mistakes) if (!have.has(m.key)) notebook.push(m);
		if (notebook.length > MAX_NOTEBOOK) notebook.splice(0, notebook.length - MAX_NOTEBOOK);
		saveStore(this.store);
	}

	/** 복기에서 고른 장면부터 다시 두는 연습판. 전적에 다시 기록하지 않는다. */
	replayFrom(index: number) {
		this.reviewOpen = false;
		this.recorded = true;
		this.lastRecord = null;
		this.rewindTo(index, `복기한 장면부터 다시 두기 · 시드 ${this.config!.seed}`);
	}

	finishCoach() {
		this.coachStep = 0;
		this.settings.coached = true;
		this.saveSettings();
	}
}

export const session = new PlaySession();
