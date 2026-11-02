// 훌라 연습장. 엔진은 WebAssembly(hoola-wasm), 화면은 사람 좌석의 관측만으로 그린다.
import init, { WasmGame, version } from "./pkg/hoola_wasm.js";

const BOTS = {
  expert: { label: "전문가 (전략서 v1)", short: "전문가", spec: "expert" },
  friendA: { label: "친구 A: 버티기 (스톱 안 함)", short: "버티기", spec: "expert:stop=never" },
  friendB: { label: "친구 B: 한방 (스톱 안 함, 털 때만 등록)", short: "한방", spec: "expert:stop=never:meld=allin" },
  friendC: { label: "친구 C: 늦은 스톱·보류", short: "늦은스톱", spec: "expert:stop=t2:meld=hold" },
  greedy: { label: "Greedy (10점 이하 즉시 스톱)", short: "Greedy", spec: "greedy" },
  random: { label: "Random", short: "Random", spec: "random" },
};
const HUMAN = 0;
const STOP_TABLE = [null, null, 4, 8, 10, 10, 10, 10]; // 가장 적게 든 상대 장수 → 최대 점수
const HINT_K = 96;
const REVIEW_K = 160;
// 복기 등급: 최선 수 대비 짝지은 손실이 표준오차 2배를 넘고 이 값 이상일 때만 지적
const GRADES = [[0.1, "블런더"], [0.05, "실수"], [0.02, "부정확"]];
const STORE_KEY = "hoola-practice-v1";

const $ = (id) => document.getElementById(id);
const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };

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

// ---------- 상태 ----------
const defaults = {
  players: 3,
  opponents: ["friendA", "friendB", "expert", "expert"],
  fullDiscards: false,
  stopHelper: true,
  autoHint: false,
  speed: 500,
  seed: "",
};
const settings = Object.assign({}, defaults, store.settings || {});
let game = null;
let config = null; // 이번 판 설정 스냅숏
let humanDecisions = []; // [{index, action}]
let selected = null; // 선택한 손패 카드
let botTimer = null;
let logged = 0;
let recorded = false;
let usedUndo = false;

// ---------- 카드 표시 ----------
function rankLabel(r) {
  return r === "T" ? "10" : r;
}
function cardText(c) {
  return rankLabel(c.slice(0, -1)) + SUIT[c.slice(-1)];
}
function cardEl(c, opts = {}) {
  const el = document.createElement(opts.button ? "button" : "span");
  el.className = "card" + ("HD".includes(c.slice(-1)) ? " red" : "") + (opts.small ? " small" : "");
  el.innerHTML = `<span class="rank">${rankLabel(c.slice(0, -1))}</span><span class="suit">${SUIT[c.slice(-1)]}</span>`;
  el.title = cardText(c);
  return el;
}
const RANK_ORDER = "A23456789TJQK";
function sortCards(cs) {
  return [...cs].sort((a, b) => {
    const s = "SHDC".indexOf(a.slice(-1)) - "SHDC".indexOf(b.slice(-1));
    return s !== 0 ? s : RANK_ORDER.indexOf(a.slice(0, -1)) - RANK_ORDER.indexOf(b.slice(0, -1));
  });
}
function cardsText(list) {
  return list.map(cardText).join(" ");
}

// ---------- 이름·행동 문장 ----------
function seatName(s) {
  if (s === HUMAN) return "나";
  const b = BOTS[config.opponents[s - 1]];
  return `${s}번 ${b ? b.short : "봇"}`;
}
function meldOwnerText(obs, idx) {
  const m = obs.melds[idx];
  if (!m) return `#${idx}`;
  const kind = { set: "세트", run: "런", seven: "7" }[m.kind];
  return `${seatName(m.owner)}의 ${kind} [${cardsText(m.cards)}]`;
}
function actionText(a, obs) {
  const [verb, ...rest] = a.split(" ");
  switch (verb) {
    case "stop": return "스톱";
    case "draw": return "받기";
    case "thankyou": return `땡큐 ${cardsText(rest)}`;
    case "thankyou-attach": return `땡큐 붙이기 → ${meldOwnerText(obs, +rest[0])}`;
    case "register": return `등록 ${cardsText(rest)}`;
    case "attach": return `붙이기 ${cardText(rest[0])} → ${meldOwnerText(obs, +rest[1])}`;
    case "discard": return `버림 ${cardText(rest[0])}`;
    default: return a;
  }
}

// ---------- 게임 진행 ----------
function rulesToml() {
  return config.fullDiscards ? '[visibility]\ndiscard_history = "full"\n' : "";
}
function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
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
  usedUndo = false;
  humanDecisions = [];
  selected = null;
  logged = 0;
  recorded = false;
  $("log").innerHTML = "";
  $("hint").textContent = "";
  $("review").innerHTML = "";
  if ($("result").open) $("result").close();
  addLog(`판 시작 · 시드 ${seed} · 선: ${seatName(first)}`, "sys");
  advance();
}
function newGame() {
  const fixed = parseInt(settings.seed, 10);
  startGame(Number.isFinite(fixed) && fixed >= 0 ? fixed >>> 0 : randomSeed());
}
function sameGame() {
  if (config) startGame(config.seed);
}

function obsNow() {
  return JSON.parse(game.observation(HUMAN));
}

function advance() {
  render();
  if (game.isOver) {
    finish();
    return;
  }
  if (game.currentPlayer === HUMAN) {
    if (settings.autoHint) runHint();
    return;
  }
  botTimer = setTimeout(() => {
    const seat = game.currentPlayer;
    const spec = BOTS[config.opponents[seat - 1]].spec;
    const a = game.botAction(spec, seat);
    game.apply(a);
    advance();
  }, settings.speed);
}

function play(action) {
  if (game.isOver || game.currentPlayer !== HUMAN) return;
  humanDecisions.push({ index: game.actionCount, action });
  game.apply(action);
  selected = null;
  $("hint").textContent = "";
  advance();
}

function undo() {
  if (!game || humanDecisions.length === 0) return;
  clearTimeout(botTimer);
  const last = humanDecisions.pop();
  const old = game;
  game = old.rewind(last.index);
  old.free();
  usedUndo = true;
  // 기록 패널 다시 그리기
  $("log").innerHTML = "";
  logged = 0;
  addLog(`되돌리기 · 시드 ${config.seed}`, "sys");
  selected = null;
  if ($("result").open) $("result").close();
  advance();
}

// ---------- 그리기 ----------
function addLog(text, cls = "") {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.className = cls;
  const log = $("log");
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

function render() {
  const obs = obsNow();
  // 새 이벤트를 기록에 추가
  for (; logged < obs.events.length; logged++) {
    const e = obs.events[logged];
    if (e.reshuffle !== undefined) addLog(`버림패를 섞어 더미 ${e.reshuffle}장`, "sys");
    else addLog(`${seatName(e.seat)}: ${actionText(e.action, obs)}`, e.seat === HUMAN ? "mine" : "");
  }

  // 상대
  const opp = $("opponents");
  opp.innerHTML = "";
  for (let s = 1; s < obs.num_players; s++) {
    const d = document.createElement("div");
    d.className = "opp" + (obs.current_player === s && obs.phase !== "over" ? " turn" : "");
    const n = obs.hand_counts[s];
    d.innerHTML = `<div class="seat-name">${seatName(s)}${obs.registered[s] ? ' <span class="badge">등록</span>' : ""}</div>
      <div class="backs">${'<span class="card back mini"></span>'.repeat(Math.min(n, 8))}</div>
      <div class="count"><b>${n}</b>장</div>`;
    opp.appendChild(d);
  }

  // 더미·버림패
  $("stock-count").textContent = obs.stock_len ?? "?";
  $("discard-count").textContent = obs.discard_count;
  const dt = $("discard-top");
  dt.innerHTML = "";
  const vis = obs.visible_discards;
  if (vis.length === 0) dt.innerHTML = '<span class="card empty"></span>';
  vis.slice(-12).forEach((c, i, arr) => {
    const el = cardEl(c, { small: i < arr.length - 1 });
    if (i === arr.length - 1 && obs.thank_you_target === c && obs.current_player === HUMAN) el.classList.add("target");
    dt.appendChild(el);
  });

  // 바닥 등록패
  const melds = $("melds");
  melds.innerHTML = "";
  if (obs.melds.length === 0) melds.innerHTML = '<p class="muted small">바닥 등록패 없음</p>';
  obs.melds.forEach((m) => {
    const d = document.createElement("div");
    d.className = "meld" + (m.owner === HUMAN ? " mine" : "");
    d.dataset.index = m.index;
    const kind = { set: "세트", run: "런", seven: "7" }[m.kind];
    d.innerHTML = `<div class="meld-head">#${m.index} ${seatName(m.owner)} · ${kind}</div>`;
    const row = document.createElement("div");
    row.className = "meld-cards";
    sortCards(m.cards).forEach((c) => row.appendChild(cardEl(c, { small: true })));
    d.appendChild(row);
    melds.appendChild(d);
  });

  // 내 손패
  $("my-points").textContent = obs.hand_points;
  $("me-label").textContent = "나" + (obs.registered[HUMAN] ? " · 등록" : "");
  const hand = $("my-hand");
  hand.innerHTML = "";
  const myTurn = obs.current_player === HUMAN && obs.phase !== "over";
  const legal = myTurn ? JSON.parse(game.legalActions()) : [];
  sortCards(obs.hand).forEach((c) => {
    const el = cardEl(c, { button: true });
    if (selected === c) el.classList.add("selected");
    el.disabled = !(myTurn && obs.phase === "meld");
    el.addEventListener("click", () => {
      selected = selected === c ? null : c;
      render();
    });
    el.addEventListener("dblclick", () => {
      if (legal.includes(`discard ${c}`)) play(`discard ${c}`);
    });
    hand.appendChild(el);
  });

  renderActions(obs, legal, myTurn);
  renderHelper(obs, legal, myTurn);
  renderStatus(obs);
  renderStats();
  $("btn-undo").disabled = humanDecisions.length === 0;
}

function button(text, onClick, cls = "") {
  const b = document.createElement("button");
  b.textContent = text;
  if (cls) b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

function renderActions(obs, legal, myTurn) {
  const box = $("actions");
  box.innerHTML = "";
  if (!myTurn) return;
  if (obs.phase === "turn_start") {
    if (legal.includes("stop")) box.appendChild(button(`스톱 (${obs.hand_points}점)`, () => play("stop"), "danger"));
    box.appendChild(button("받기", () => play("draw"), "primary"));
    legal.filter((a) => a.startsWith("thankyou")).forEach((a) => box.appendChild(button(actionText(a, obs), () => play(a), "good")));
    return;
  }
  const regs = legal.filter((a) => a.startsWith("register "));
  regs.forEach((a) => box.appendChild(button(actionText(a, obs), () => play(a), "good")));
  const attaches = legal.filter((a) => a.startsWith("attach ") && (!selected || a.split(" ")[1] === selected));
  attaches.forEach((a) => box.appendChild(button(actionText(a, obs), () => play(a), "good")));
  if (selected && legal.includes(`discard ${selected}`)) {
    box.appendChild(button(`버리기 ${cardText(selected)}`, () => play(`discard ${selected}`), "primary"));
  } else {
    const p = document.createElement("span");
    p.className = "muted small";
    p.textContent = "버릴 카드를 눌러 고르거나 두 번 누르세요";
    box.appendChild(p);
  }
}

function renderHelper(obs, legal, myTurn) {
  const el = $("stop-helper");
  el.textContent = "";
  el.className = "helper";
  if (!settings.stopHelper || !myTurn || obs.phase !== "turn_start" || !legal.includes("stop")) return;
  const fewest = Math.min(7, ...obs.hand_counts.filter((_, s) => s !== HUMAN));
  const limit = STOP_TABLE[fewest];
  const ok = limit !== null && obs.hand_points <= limit;
  el.textContent = `기준표: 상대 최소 ${fewest}장 → ${limit === null ? "스톱 금지" : `${limit}점 이하 스톱`} · ${ok ? "스톱 권장" : "기다림"}`;
  el.classList.add(ok ? "go" : "wait");
}

function renderStatus(obs) {
  const st = $("status");
  if (obs.phase === "over") {
    st.textContent = "판 종료";
  } else if (obs.current_player === HUMAN) {
    st.textContent = obs.phase === "turn_start" ? "내 차례: 스톱 / 받기 / 땡큐" : "내 차례: 등록·붙이기 후 버리기";
  } else {
    st.textContent = `${seatName(obs.current_player)} 생각 중…`;
  }
  st.className = "status" + (obs.current_player === HUMAN && obs.phase !== "over" ? " my-turn" : "");
}

// ---------- 힌트·복기 ----------
function runHint() {
  if (!game || game.isOver || game.currentPlayer !== HUMAN) return;
  const obs = obsNow();
  const hint = $("hint");
  hint.textContent = "분석 중…";
  setTimeout(() => {
    const expert = game.botAction("expert", 0);
    const scored = JSON.parse(game.evaluate(HINT_K, game.actionCount + 1));
    hint.innerHTML = "";
    const ol = document.createElement("ol");
    ol.className = "hint-list";
    scored.slice(0, 6).forEach((v, i) => {
      const li = document.createElement("li");
      const tag = v.action === expert ? ' <span class="badge">전문가 선택</span>' : "";
      const sig = v.gap > 2 * v.gap_se;
      const gapText = i === 0 ? "" : sig ? ` <span class="loss">−${(v.gap * 100).toFixed(1)}%p</span>` : ' <span class="muted">(차이 불확실)</span>';
      li.innerHTML = `<b>${(v.value * 100).toFixed(1)}%</b>${gapText} ${actionText(v.action, obs)}${tag}`;
      if (i === 0) li.className = "best";
      ol.appendChild(li);
    });
    hint.appendChild(ol);
    const note = document.createElement("p");
    note.className = "muted small";
    note.textContent = `L3: 숨은 패 ${HINT_K}개 샘플 × 수마다 끝까지 시뮬레이션한 추정 승률. −%p는 1위 수보다 확실히 나쁜 만큼(같은 샘플로 비교, 95%), "차이 불확실"은 1위와 사실상 같은 수다.`;
    hint.appendChild(note);
  }, 20);
}

function review() {
  const out = $("review");
  const decisions = humanDecisions.slice();
  if (decisions.length === 0) {
    out.textContent = "복기할 내 결정이 없다.";
    return;
  }
  out.textContent = `복기 중… 0 / ${decisions.length}`;
  const rows = [];
  let i = 0;
  const stepReview = () => {
    if (i >= decisions.length) {
      showReview(rows);
      return;
    }
    const d = decisions[i];
    const g = game.rewind(d.index);
    const legal = JSON.parse(g.legalActions());
    if (legal.length > 1) {
      const obs = JSON.parse(g.observation(HUMAN));
      const scored = JSON.parse(g.evaluate(REVIEW_K, d.index + 7));
      const best = scored[0];
      const mine = scored.find((v) => v.action === d.action);
      const significant = mine && mine.gap > 2 * mine.gap_se;
      const loss = significant ? mine.gap : 0;
      rows.push({ obs, d, best, mine, loss });
    }
    g.free();
    i++;
    out.textContent = `복기 중… ${i} / ${decisions.length}`;
    setTimeout(stepReview, 0);
  };
  setTimeout(stepReview, 0);
}

function showReview(rows) {
  const out = $("review");
  out.innerHTML = "";
  const total = rows.reduce((s, r) => s + r.loss, 0);
  const p = document.createElement("p");
  p.innerHTML = `선택지가 있던 결정 ${rows.length}개 · 확실한 손실 합 <b>${(total * 100).toFixed(1)}%p</b> <span class="muted">(L3 ${REVIEW_K}샘플, 같은 샘플로 비교해 95% 확실한 차이만 셈)</span>`;
  out.appendChild(p);
  const worst = rows.filter((r) => r.loss >= GRADES[GRADES.length - 1][0]).sort((a, b) => b.loss - a.loss).slice(0, 6);
  if (worst.length === 0) {
    const ok = document.createElement("p");
    ok.textContent = "확실한 실수(2%p 이상)는 없었다.";
    out.appendChild(ok);
    return;
  }
  const ol = document.createElement("ol");
  worst.forEach((r) => {
    const li = document.createElement("li");
    const grade = GRADES.find(([t]) => r.loss >= t)[1];
    li.innerHTML = `<b>${grade}</b> −${(r.loss * 100).toFixed(1)}%p · 손패 ${r.obs.hand_points}점 · 내 수: ${actionText(r.d.action, r.obs)} → 추천: ${actionText(r.best.action, r.obs)} (${(r.best.value * 100).toFixed(0)}%)`;
    ol.appendChild(li);
  });
  out.appendChild(ol);
}

// ---------- 종료·전적 ----------
function finish() {
  const out = JSON.parse(game.outcome());
  const obs = obsNow();
  const won = out.winners.includes(HUMAN);
  const share = out.rewards[HUMAN];
  $("result-title").textContent = out.winners.length === 0 ? "무승부" : won ? (out.winners.length > 1 ? "공동 승리" : "승리!") : "패배";
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
    const tr = document.createElement("tr");
    if (out.winners.includes(s)) tr.className = "winner";
    const td = document.createElement("td");
    td.textContent = seatName(s);
    const tc = document.createElement("td");
    sortCards(h).forEach((c) => tc.appendChild(cardEl(c, { small: true })));
    const tp = document.createElement("td");
    tp.textContent = `${out.points[s]}점`;
    tr.append(td, tc, tp);
    body.appendChild(tr);
  });
  $("review").innerHTML = "";
  if (!recorded) {
    recorded = true;
    store.games.push({
      at: new Date().toISOString(),
      players: config.players,
      opponents: config.opponents,
      seed: config.seed,
      reason: out.reason,
      share,
      undo: usedUndo,
      replay: JSON.parse(game.replayJson()),
      human_seat: HUMAN,
    });
    if (store.games.length > 500) store.games.splice(0, store.games.length - 500);
    saveStore();
  }
  renderStats();
  if (!$("result").open) $("result").showModal();
}

function renderStats() {
  const el = $("stats");
  const games = store.games.filter((g) => !g.undo);
  const practice = store.games.length - games.length;
  if (games.length === 0) {
    el.textContent = practice ? `되돌리기를 쓴 연습판 ${practice}판 (전적 제외)` : "아직 끝낸 판이 없다.";
    return;
  }
  const groups = {};
  games.forEach((g) => {
    const key = `${g.players}인 · ${g.opponents.map((o) => (BOTS[o] ? BOTS[o].short : o)).join("·")}`;
    const x = (groups[key] ||= { n: 0, share: 0, players: g.players });
    x.n += 1;
    x.share += g.share;
  });
  const rows = Object.entries(groups)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([k, x]) => `<tr><td>${k}</td><td>${x.n}판</td><td><b>${((x.share / x.n) * 100).toFixed(0)}%</b></td><td class="muted">기준 ${(100 / x.players).toFixed(0)}%</td></tr>`)
    .join("");
  const note = practice ? `<p class="muted">되돌리기를 쓴 연습판 ${practice}판은 전적에서 뺐다.</p>` : "";
  el.innerHTML = `<table class="stats-table"><tbody>${rows}</tbody></table>${note}`;
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
    const label = document.createElement("label");
    label.textContent = `${i + 1}번 상대`;
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
  $("set-stop-helper").checked = settings.stopHelper;
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
  $("set-stop-helper").addEventListener("change", (e) => { settings.stopHelper = e.target.checked; persistSettings(); if (game) render(); });
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
  document.title = `훌라 연습장 · 엔진 ${version()}`;
  bindSettings();
  $("btn-new").addEventListener("click", newGame);
  $("btn-same").addEventListener("click", sameGame);
  $("btn-undo").addEventListener("click", undo);
  $("btn-hint").addEventListener("click", runHint);
  $("btn-export").addEventListener("click", exportGames);
  $("res-new").addEventListener("click", newGame);
  $("res-same").addEventListener("click", sameGame);
  $("res-review").addEventListener("click", review);
  newGame();
}

main().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", `<p class="error">엔진을 불러오지 못했다: ${e}</p>`);
});
