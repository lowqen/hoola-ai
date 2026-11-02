// 훌라 연습장. 엔진은 WebAssembly(hoola-wasm), 화면은 사람 좌석의 관측만으로 그린다.
import init, { WasmGame, version } from "./pkg/hoola_wasm.js";
import {
  STOP_TABLE, actionText, cardBack, cardEl, cardText, cardsText, el, parseAction, sortCards,
} from "./common.js";
import { CATEGORY, openReview } from "./review.js";

const BOTS = {
  expert: { label: "전문가 (전략서 v1)", short: "전문가", spec: "expert" },
  friendA: { label: "친구 A: 버티기 (스톱 안 함)", short: "버티기", spec: "expert:stop=never" },
  friendB: { label: "친구 B: 한방 (스톱 안 함, 털 때만 등록)", short: "한방", spec: "expert:stop=never:meld=allin" },
  friendC: { label: "친구 C: 늦은 스톱·보류", short: "늦은스톱", spec: "expert:stop=t2:meld=hold" },
  greedy: { label: "Greedy (10점 이하 즉시 스톱)", short: "Greedy", spec: "greedy" },
  random: { label: "Random", short: "Random", spec: "random" },
};
const HUMAN = 0;
const HINT_K = 96;
const STORE_KEY = "hoola-practice-v1";

const $ = (id) => document.getElementById(id);

// ---------- 저장소 (실패해도 동작) ----------
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* 무시 */ }
  return { settings: null, games: [] };
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (_) { /* 무시 */ }
}
const store = loadStore();
store.games ||= [];

// ---------- 상태 ----------
const defaults = {
  players: 3,
  opponents: ["friendA", "friendB", "expert", "expert"],
  fullDiscards: false,
  beginner: false,
  autoHint: false,
  speed: 500,
  seed: "",
};
const settings = Object.assign({}, defaults, store.settings || {});
let game = null;
let config = null; // 이번 판 설정 스냅숏
let humanDecisions = []; // [{index, action}]
const selected = new Set(); // 선택한 손패 카드
let usedBeginner = false; // 이번 판에 초보자 모드로 결정한 적이 있는지
let usedUndo = false;
let botTimer = null;
let logged = 0;
let recorded = false;
let lastRecord = null;
let lastTop = null;

// ---------- 이름 ----------
function seatName(s) {
  if (s === HUMAN) return "나";
  const b = BOTS[config.opponents[s - 1]];
  return `${s}번 ${b ? b.short : "봇"}`;
}
const actText = (a, obs) => actionText(a, obs, seatName);

// ---------- 게임 진행 ----------
function rulesToml() {
  return config.fullDiscards ? '[visibility]\ndiscard_history = "full"\n' : "";
}
function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
function resetLog(text) {
  $("log").innerHTML = "";
  logged = 0;
  addLog(text, "sys");
}
function startGame(seed) {
  clearTimeout(botTimer);
  config = {
    players: settings.players,
    opponents: settings.opponents.slice(0, settings.players - 1),
    fullDiscards: settings.fullDiscards,
    seed,
  };
  const first = seed % config.players;
  if (game) game.free();
  game = new WasmGame(config.players, seed, first, rulesToml());
  humanDecisions = [];
  selected.clear();
  usedBeginner = false;
  usedUndo = false;
  recorded = false;
  lastRecord = null;
  lastTop = null;
  flash("");
  $("hint").textContent = "";
  if ($("result").open) $("result").close();
  resetLog(`판 시작 · 시드 ${seed} · 선: ${seatName(first)}`);
  advance();
}
function newGame() {
  const fixed = parseInt(settings.seed, 10);
  startGame(Number.isFinite(fixed) && fixed >= 0 ? fixed >>> 0 : randomSeed());
}
function sameGame() {
  if (config) startGame(config.seed);
}
const obsNow = () => JSON.parse(game.observation(HUMAN));

function advance() {
  render();
  if (game.isOver) {
    finish();
    return;
  }
  if (game.currentPlayer === HUMAN) {
    if (settings.beginner && settings.autoHint) runHint();
    return;
  }
  botTimer = setTimeout(() => {
    const seat = game.currentPlayer;
    const spec = BOTS[config.opponents[seat - 1]].spec;
    game.apply(game.botAction(spec, seat));
    advance();
  }, settings.speed);
}

// 내 행동을 시도한다. 불법이면 상태는 그대로이고 failMsg를 보여 준다.
function play(action, failMsg = "지금은 할 수 없는 수다") {
  if (game.isOver || game.currentPlayer !== HUMAN) return false;
  const index = game.actionCount;
  try {
    game.apply(action);
  } catch (_) {
    flash(failMsg);
    return false;
  }
  if (settings.beginner) usedBeginner = true;
  humanDecisions.push({ index, action: game.lastAction() });
  selected.clear();
  flash("");
  $("hint").textContent = "";
  advance();
  return true;
}

function flash(msg) {
  const m = $("msg");
  m.textContent = msg;
  m.hidden = !msg;
}

function registerSelected(sel) {
  if (sel.length === 0) return flash("등록할 카드를 고르세요");
  play(`register ${sel.join(" ")}`, "세트(같은 숫자 3장 이상), 런(같은 무늬 연속 3장 이상), 7 한 장만 등록할 수 있다");
}

function thankYouSelected(obs, sel) {
  if (!obs.discard_top) return flash("버림패가 없다");
  if (sel.length < 2) return flash("버림패 맨 위 카드와 조합할 내 카드를 2장 이상 고르세요");
  play(
    `thankyou ${[...sel, obs.discard_top].join(" ")}`,
    "땡큐할 수 없다: 바로 앞 사람이 버린 맨 위 카드와 고른 카드가 세트나 런이 되어야 한다",
  );
}

function attachTo(idx, obs) {
  if (selected.size !== 1) return flash("붙일 카드 1장을 먼저 고른 뒤 바닥 조합을 누르세요");
  const [c] = selected;
  const msg = obs.registered[HUMAN] ? "그 조합에는 붙일 수 없다" : "등록이나 땡큐를 한 번 한 뒤에만 붙일 수 있다";
  play(`attach ${c} ${idx}`, msg);
}

function rewindTo(index, note) {
  clearTimeout(botTimer);
  const old = game;
  game = old.rewind(index);
  old.free();
  humanDecisions = humanDecisions.filter((d) => d.index < index);
  usedUndo = true;
  selected.clear();
  flash("");
  lastTop = null;
  if ($("result").open) $("result").close();
  resetLog(note);
  advance();
}

function undo() {
  if (!game || humanDecisions.length === 0) return;
  rewindTo(humanDecisions[humanDecisions.length - 1].index, `되돌리기 · 시드 ${config.seed}`);
}

function replayFrom(index) {
  // 복기에서 고른 장면부터 다시 두는 연습판 (전적에 다시 기록하지 않는다)
  recorded = true;
  lastRecord = null;
  rewindTo(index, `복기한 장면부터 다시 두기 · 시드 ${config.seed}`);
}

// ---------- 그리기 ----------
function addLog(text, cls = "") {
  const li = el("li", cls, text);
  const log = $("log");
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

function button(text, onClick, cls = "") {
  const b = el("button", cls, text);
  b.addEventListener("click", onClick);
  return b;
}

function guide(box, text) {
  box.appendChild(el("span", "guide", text));
}

function lastActionBySeat(obs) {
  const last = {};
  for (const e of obs.events) if (e.action !== undefined) last[e.seat] = e.action;
  return last;
}

function render() {
  const obs = obsNow();
  const myTurn = obs.current_player === HUMAN && obs.phase !== "over";
  const legal = myTurn ? JSON.parse(game.legalActions()) : [];
  $("hint-panel").hidden = !settings.beginner;

  for (; logged < obs.events.length; logged++) {
    const e = obs.events[logged];
    if (e.reshuffle !== undefined) addLog(`버림패를 섞어 더미 ${e.reshuffle}장`, "sys");
    else addLog(`${seatName(e.seat)} · ${actText(e.action, obs)}`, e.seat === HUMAN ? "mine" : "");
  }

  renderSeats(obs);
  renderBoard(obs, myTurn);
  renderHand(obs, myTurn);
  renderActions(obs, legal, myTurn);
  renderHelper(obs, legal, myTurn);
  renderStatus(obs);
  renderStats();
  $("btn-undo").disabled = humanDecisions.length === 0;
}

function renderSeats(obs) {
  const box = $("opponents");
  box.innerHTML = "";
  const last = lastActionBySeat(obs);
  for (let s = 1; s < obs.num_players; s++) {
    const bot = BOTS[config.opponents[s - 1]];
    const turn = obs.current_player === s && obs.phase !== "over";
    const seat = el("div", "seat" + (turn ? " turn" : ""));
    const head = el("div", "seat-head");
    head.appendChild(el("span", `avatar a${s}`, bot ? bot.short.slice(0, 1) : "?"));
    const id = el("div", "seat-id");
    id.appendChild(el("div", "seat-name", `${s}번 ${bot ? bot.short : "봇"}`));
    const tags = el("div", "seat-tags");
    if (obs.registered[s]) tags.appendChild(el("span", "tag", "등록"));
    if (turn) tags.appendChild(el("span", "thinking", "생각 중"));
    id.appendChild(tags);
    head.appendChild(id);
    const n = obs.hand_counts[s];
    const count = el("div", "seat-count" + (n <= 3 ? " low" : ""));
    count.innerHTML = `<b>${n}</b><span>장</span>`;
    head.appendChild(count);
    seat.appendChild(head);
    const fan = el("div", "fan");
    for (let i = 0; i < Math.min(n, 9); i++) fan.appendChild(cardBack("xs"));
    seat.appendChild(fan);
    seat.appendChild(el("div", "seat-last", last[s] ? `방금 · ${actText(last[s], obs)}` : " "));
    box.appendChild(seat);
  }
}

function renderBoard(obs, myTurn) {
  // 더미
  const stock = $("stock-stack");
  stock.innerHTML = "";
  stock.appendChild(cardBack("md"));
  $("stock-count").textContent = obs.stock_len ?? "?";
  $("discard-count").textContent = obs.discard_count;
  // 버림패
  const dt = $("discard-top");
  dt.innerHTML = "";
  const vis = obs.visible_discards;
  if (vis.length === 0) dt.appendChild(el("span", "card md empty"));
  vis.slice(-12).forEach((c, i, arr) => {
    const isTop = i === arr.length - 1;
    const card = cardEl(c, { size: isTop ? "md" : "sm" });
    if (isTop && c !== lastTop) card.classList.add("pop");
    if (isTop && settings.beginner && obs.thank_you_target === c && myTurn) card.classList.add("target");
    dt.appendChild(card);
  });
  lastTop = obs.discard_top;
  // 바닥 조합
  const melds = $("melds");
  melds.innerHTML = "";
  if (obs.melds.length === 0) melds.appendChild(el("p", "empty-note", "아직 바닥에 조합이 없다"));
  obs.melds.forEach((m) => {
    const d = el("div", "meld" + (m.owner === HUMAN ? " mine" : ""));
    const kind = { set: "세트", run: "런", seven: "7" }[m.kind];
    d.appendChild(el("div", "meld-head", `${seatName(m.owner)} · ${kind}`));
    const row = el("div", "meld-cards");
    sortCards(m.cards).forEach((c) => row.appendChild(cardEl(c, { size: "sm" })));
    d.appendChild(row);
    if (myTurn && obs.phase === "meld") {
      d.classList.add("clickable");
      d.title = "고른 카드 1장을 이 조합에 붙이기";
      d.addEventListener("click", () => attachTo(m.index, obs));
    }
    melds.appendChild(d);
  });
}

function renderHand(obs, myTurn) {
  $("my-points").textContent = obs.hand_points;
  $("me-label").textContent = "나" + (obs.registered[HUMAN] ? " · 등록" : "");
  const hand = $("my-hand");
  hand.innerHTML = "";
  hand.classList.toggle("active", myTurn);
  for (const c of [...selected]) if (!obs.hand.includes(c)) selected.delete(c);
  sortCards(obs.hand).forEach((c) => {
    const card = cardEl(c, { button: true, size: "lg" });
    if (selected.has(c)) card.classList.add("selected");
    card.disabled = !myTurn;
    card.addEventListener("click", () => {
      if (selected.has(c)) selected.delete(c);
      else selected.add(c);
      flash("");
      render();
    });
    card.addEventListener("dblclick", () => {
      if (obs.phase === "meld") play(`discard ${c}`);
    });
    hand.appendChild(card);
  });
}

function renderActions(obs, legal, myTurn) {
  const box = $("actions");
  box.innerHTML = "";
  if (!myTurn) return;
  const sel = sortCards([...selected]);
  if (obs.phase === "turn_start") {
    if (settings.beginner) {
      if (legal.includes("stop")) box.appendChild(button(`스톱 (${obs.hand_points}점)`, () => play("stop"), "danger"));
      box.appendChild(button("받기", () => play("draw"), "primary"));
      legal.filter((a) => a.startsWith("thankyou")).forEach((a) => box.appendChild(button(actText(a, obs), () => play(a), "good")));
    } else {
      box.appendChild(button("스톱", () => play("stop", `손패 ${obs.hand_points}점: ${obs.stop_limit}점 이하일 때만 스톱할 수 있다`), "danger"));
      box.appendChild(button("받기", () => play("draw"), "primary"));
      box.appendChild(button(sel.length ? `땡큐 (${cardsText(sel)} + 버림패)` : "땡큐", () => thankYouSelected(obs, sel), "good"));
      guide(box, "땡큐: 버림패 맨 위와 조합할 내 카드를 고른 뒤 누르세요");
    }
    return;
  }
  if (settings.beginner) {
    legal.filter((a) => a.startsWith("register ")).forEach((a) => box.appendChild(button(actText(a, obs), () => play(a), "good")));
    legal
      .filter((a) => a.startsWith("attach ") && (selected.size !== 1 || parseAction(a).cards[0] === sel[0]))
      .forEach((a) => box.appendChild(button(actText(a, obs), () => play(a), "good")));
  } else {
    box.appendChild(button(sel.length ? `등록 ${cardsText(sel)}` : "등록", () => registerSelected(sel), "good"));
  }
  if (sel.length === 1) box.appendChild(button(`버리기 ${cardText(sel[0])}`, () => play(`discard ${sel[0]}`), "primary"));
  guide(
    box,
    settings.beginner
      ? "버릴 카드를 눌러 고르거나 두 번 누르세요"
      : "카드를 골라 등록 · 1장 고르고 바닥 조합을 누르면 붙이기 · 1장 고르고 버리기 (두 번 누르면 바로 버림)",
  );
}

function renderHelper(obs, legal, myTurn) {
  const h = $("stop-helper");
  h.textContent = "";
  h.className = "helper";
  h.hidden = true;
  if (!settings.beginner || !myTurn || obs.phase !== "turn_start" || !legal.includes("stop")) return;
  const fewest = Math.min(7, ...obs.hand_counts.filter((_, s) => s !== HUMAN));
  const limit = STOP_TABLE[fewest];
  const ok = limit !== null && obs.hand_points <= limit;
  h.hidden = false;
  h.textContent = `스톱 기준표 · 상대 최소 ${fewest}장 → ${limit === null ? "스톱 금지" : `${limit}점 이하`} · ${ok ? "스톱 권장" : "기다림"}`;
  h.classList.add(ok ? "go" : "wait");
}

function renderStatus(obs) {
  const st = $("status");
  if (obs.phase === "over") st.textContent = "판 종료";
  else if (obs.current_player === HUMAN) st.textContent = obs.phase === "turn_start" ? "내 차례 · 스톱 / 받기 / 땡큐" : "내 차례 · 등록·붙이기 후 버리기";
  else st.textContent = `${seatName(obs.current_player)} 차례`;
  st.className = "status" + (obs.current_player === HUMAN && obs.phase !== "over" ? " my-turn" : "");
  $("rack").classList.toggle("my-turn", obs.current_player === HUMAN && obs.phase !== "over");
}

// ---------- 힌트 (초보자 모드) ----------
function runHint() {
  if (!settings.beginner || !game || game.isOver || game.currentPlayer !== HUMAN) return;
  const obs = obsNow();
  const hint = $("hint");
  hint.innerHTML = '<p class="muted small">분석 중…</p>';
  setTimeout(() => {
    const expert = game.botAction("expert", 0);
    const scored = JSON.parse(game.evaluate(HINT_K, game.actionCount + 1));
    hint.innerHTML = "";
    const legalNow = scored.map((v) => v.action);
    if (obs.phase === "turn_start" && legalNow.includes("stop")) {
      const fewest = Math.min(7, ...obs.hand_counts.filter((_, s) => s !== HUMAN));
      const limit = STOP_TABLE[fewest];
      const ok = limit !== null && obs.hand_points <= limit;
      const note = el("p", "hint-table " + (ok ? "go" : "wait"));
      note.textContent = `스톱 판단은 기준표 우선: 상대 최소 ${fewest}장 → ${limit === null ? "스톱 금지" : `${limit}점 이하`} → ${ok ? "스톱" : "스톱하지 않음"}. 아래 시뮬레이션의 스톱 수치는 참고만.`;
      hint.appendChild(note);
    }
    const ol = el("ol", "hint-list");
    scored.slice(0, 6).forEach((v, i) => {
      const li = el("li", i === 0 ? "best" : "");
      const sig = v.gap > 2 * v.gap_se;
      const gapText = i === 0 ? "" : sig ? ` <span class="loss">−${(v.gap * 100).toFixed(1)}%p</span>` : ' <span class="muted">(차이 불확실)</span>';
      const tag = v.action === expert ? ' <span class="tag">전문가</span>' : "";
      li.innerHTML = `<b>${(v.value * 100).toFixed(1)}%</b>${gapText} ${actText(v.action, obs)}${tag}`;
      ol.appendChild(li);
    });
    hint.appendChild(ol);
    hint.appendChild(el("p", "muted xsmall", `숨은 패 ${HINT_K}가지 × 수마다 끝까지 시뮬레이션한 추정 승률. −%p는 1위보다 확실히 나쁜 만큼, "차이 불확실"은 사실상 같은 수.`));
  }, 20);
}

// ---------- 종료·전적 ----------
function finish() {
  const out = JSON.parse(game.outcome());
  const obs = obsNow();
  const won = out.winners.includes(HUMAN);
  const title = $("result-title");
  title.textContent = out.winners.length === 0 ? "무승부" : won ? (out.winners.length > 1 ? "공동 승리" : "승리") : "패배";
  title.className = "result-title " + (won ? "win" : out.winners.length === 0 ? "draw" : "lose");
  const reasons = {
    out: `${seatName(out.player)} 털기`,
    "stop-success": `${seatName(out.caller)} 스톱 성공`,
    "stop-fail": `${seatName(out.caller)} 스톱 실패`,
    "no-cards": "받을 카드 없음",
    "turn-limit": "턴 제한",
  };
  $("result-reason").textContent = reasons[out.reason] || out.reason;
  const body = $("result-body");
  body.innerHTML = "";
  obs.revealed_hands.forEach((h, s) => {
    const tr = el("tr", out.winners.includes(s) ? "winner" : "");
    const td = el("td", "who", seatName(s) + (out.winners.includes(s) ? " 🏆" : ""));
    const tc = el("td", "cards");
    sortCards(h).forEach((c) => tc.appendChild(cardEl(c, { size: "sm" })));
    if (h.length === 0) tc.appendChild(el("span", "muted small", "털었음"));
    const tp = el("td", "pts", `${out.points[s]}점`);
    tr.append(td, tc, tp);
    body.appendChild(tr);
  });
  $("res-review").disabled = humanDecisions.length === 0;
  if (!recorded) {
    recorded = true;
    lastRecord = {
      at: new Date().toISOString(),
      players: config.players,
      opponents: config.opponents,
      seed: config.seed,
      reason: out.reason,
      share: out.rewards[HUMAN],
      undo: usedUndo,
      beginner: usedBeginner,
      replay: JSON.parse(game.replayJson()),
      human_seat: HUMAN,
    };
    store.games.push(lastRecord);
    if (store.games.length > 500) store.games.splice(0, store.games.length - 500);
    saveStore();
  }
  renderStats();
  if (!$("result").open) $("result").showModal();
}

function startReview() {
  if (!game || humanDecisions.length === 0) return;
  if ($("result").open) $("result").close();
  const record = lastRecord;
  openReview({
    replayJson: game.replayJson(),
    decisions: humanDecisions.slice(),
    seat: HUMAN,
    players: config.players,
    seatName,
    outcome: JSON.parse(game.outcome()),
    finalEvents: obsNow().events,
    onReplayFrom: replayFrom,
    onSummary: (summary) => {
      if (!record) return;
      record.review = summary;
      saveStore();
      renderStats();
    },
  });
}

function renderStats() {
  const box = $("stats");
  box.innerHTML = "";
  const games = store.games.filter((g) => !g.undo);
  const practice = store.games.length - games.length;
  if (games.length === 0) {
    box.appendChild(el("p", "muted small", practice ? `되돌리기를 쓴 연습판 ${practice}판 (전적 제외)` : "아직 끝낸 판이 없다."));
    return;
  }
  const groups = {};
  games.forEach((g) => {
    const key = `${g.beginner ? "초보 · " : ""}${g.players}인 · ${g.opponents.map((o) => (BOTS[o] ? BOTS[o].short : o)).join("·")}`;
    const x = (groups[key] ||= { n: 0, share: 0, players: g.players });
    x.n += 1;
    x.share += g.share;
  });
  const list = el("div", "stat-rows");
  Object.entries(groups)
    .sort((a, b) => b[1].n - a[1].n)
    .forEach(([k, x]) => {
      const rate = x.share / x.n;
      const fair = 1 / x.players;
      const row = el("div", "stat-row");
      row.innerHTML = `<div class="stat-name">${k}</div>
        <div class="stat-bar"><div class="fill" style="width:${Math.min(100, rate * 100)}%"></div><div class="fair" style="left:${fair * 100}%" title="공평한 몫 ${(fair * 100).toFixed(0)}%"></div></div>
        <div class="stat-num"><b>${(rate * 100).toFixed(0)}%</b> <span class="muted">${x.n}판</span></div>`;
      list.appendChild(row);
    });
  box.appendChild(list);

  const reviewed = store.games.filter((g) => g.review);
  if (reviewed.length) {
    const cats = {};
    let loss = 0;
    let decisions = 0;
    let accurate = 0;
    reviewed.forEach((g) => {
      loss += g.review.loss;
      decisions += g.review.decisions;
      accurate += g.review.accurate;
      for (const [c, n] of Object.entries(g.review.categories || {})) cats[c] = (cats[c] || 0) + n;
    });
    const weak = el("div", "weak");
    weak.appendChild(el("h3", "", "복기로 본 약점"));
    weak.appendChild(el("p", "small", `복기 ${reviewed.length}판 · 정확도 ${decisions ? Math.round((accurate / decisions) * 100) : 0}% · 판당 손실 ${((loss / reviewed.length) * 100).toFixed(1)}%p`));
    const max = Math.max(1, ...Object.values(cats));
    Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([c, n]) => {
        const row = el("div", "weak-row");
        row.innerHTML = `<span>${CATEGORY[c] || c}</span><span class="weak-bar"><span style="width:${(n / max) * 100}%"></span></span><b>${n}</b>`;
        weak.appendChild(row);
      });
    if (!Object.keys(cats).length) weak.appendChild(el("p", "muted small", "확실한 실수가 아직 없다."));
    box.appendChild(weak);
  }
  if (practice) box.appendChild(el("p", "muted xsmall", `되돌리기·다시 두기를 쓴 연습판 ${practice}판은 승률에서 뺐다.`));
}

function exportGames() {
  const blob = new Blob([JSON.stringify({ format: "hoola-practice-1", games: store.games }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hoola-games-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- 설정 UI ----------
function renderOpponentSelects() {
  const box = $("set-opponents");
  box.innerHTML = "";
  for (let i = 0; i < settings.players - 1; i++) {
    const label = el("label", "field");
    label.appendChild(el("span", "", `${i + 1}번 상대`));
    const sel = document.createElement("select");
    Object.entries(BOTS).forEach(([k, b]) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = b.label;
      if (settings.opponents[i] === k) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      settings.opponents[i] = sel.value;
      persistSettings();
    });
    label.appendChild(sel);
    box.appendChild(label);
  }
}
function persistSettings() {
  store.settings = settings;
  saveStore();
}
function bindSettings() {
  $("set-players").value = String(settings.players);
  $("set-full-discards").checked = settings.fullDiscards;
  $("set-beginner").checked = settings.beginner;
  $("set-show-hint").checked = settings.autoHint;
  $("set-speed").value = String(settings.speed);
  $("set-seed").value = settings.seed;
  $("set-players").addEventListener("change", (e) => {
    settings.players = +e.target.value;
    while (settings.opponents.length < 4) settings.opponents.push("expert");
    renderOpponentSelects();
    persistSettings();
  });
  $("set-full-discards").addEventListener("change", (e) => { settings.fullDiscards = e.target.checked; persistSettings(); });
  $("set-beginner").addEventListener("change", (e) => {
    settings.beginner = e.target.checked;
    persistSettings();
    flash("");
    if (game) render();
    if (settings.beginner && settings.autoHint && game && !game.isOver && game.currentPlayer === HUMAN) runHint();
  });
  $("set-show-hint").addEventListener("change", (e) => { settings.autoHint = e.target.checked; persistSettings(); });
  $("set-speed").addEventListener("change", (e) => { settings.speed = +e.target.value; persistSettings(); });
  $("set-seed").addEventListener("change", (e) => { settings.seed = e.target.value.trim(); persistSettings(); });
  $("btn-settings").addEventListener("click", () => {
    const s = $("settings");
    s.hidden = !s.hidden;
    $("btn-settings").setAttribute("aria-expanded", String(!s.hidden));
  });
  renderOpponentSelects();
}

// ---------- 시작 ----------
async function main() {
  await init();
  $("engine-ver").textContent = `엔진 ${version()} · 브라우저에서 실행`;
  bindSettings();
  $("btn-new").addEventListener("click", newGame);
  $("btn-same").addEventListener("click", sameGame);
  $("btn-undo").addEventListener("click", undo);
  $("btn-hint").addEventListener("click", runHint);
  $("btn-export").addEventListener("click", exportGames);
  $("res-new").addEventListener("click", newGame);
  $("res-same").addEventListener("click", sameGame);
  $("res-review").addEventListener("click", startReview);
  newGame();
}

main().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", `<p class="error">엔진을 불러오지 못했다: ${e}</p>`);
});
