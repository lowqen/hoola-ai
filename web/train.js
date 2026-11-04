// 훈련 모드: 짧은 문제를 빠르게 반복한다. 문제·정답은 엔진이 만든다 (train-worker.js).
import { meldKind } from "./pkg/hoola_wasm.js";
import {
  STOP_TABLE, actionText, cardBack, cardEl, cardText, cardsText, discardScore, el, fragmentOf,
  parseAction, points, sortCards, unseenOf,
} from "./common.js";

export const DRILLS = {
  meld: { title: "조합 찾기", rule: "같은 숫자 3장+ · 같은 무늬 연속 3장+ · 7 한 장", icon: "▦" },
  thankyou: { title: "땡큐 찾기", rule: "앞사람이 막 버린 카드 + 내 카드 2장 → 바로 등록", icon: "⟲" },
  stop: { title: "스톱 판단", rule: "1금 2-4 3-8 4-10", icon: "■" },
  discard: { title: "버릴 카드", rule: "점수 − 살려 줄 카드 수 × 3 이 가장 큰 카드", icon: "↓" },
  notebook: { title: "오답 노트", rule: "복기·훈련에서 틀린 장면 다시 풀기", icon: "✎" },
};
const SESSION_LEN = 10;
const RETRY_GAP = 3; // 틀린 문제는 3문제 뒤에 다시

const $ = (id) => document.getElementById(id);
let app = null; // { store, saveStore }
let worker = null;
let reqId = 0;
const pending = new Map();
const queues = {};
let session = null;
let current = null; // { puzzle, type, answered, started, fromNotebook, retry }
let onKey = null;

// ---------- 문제 생성 (워커, 미리 2개씩) ----------
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./train-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const { id, puzzle, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(puzzle);
  };
  return worker;
}
function request(type) {
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type });
  });
}
function prefetch(type) {
  const q = (queues[type] ||= []);
  while (q.length < 2) q.push(request(type).catch((e) => ({ error: String(e) })));
}
async function take(type) {
  prefetch(type);
  const p = queues[type].shift();
  prefetch(type);
  return p;
}

// ---------- 기록 ----------
function stats() {
  const s = (app.store.train ||= {});
  for (const k of Object.keys(DRILLS)) s[k] ||= { n: 0, correct: 0, streak: 0, best: 0, recent: [] };
  return s;
}
function notebook() {
  return (app.store.notebook ||= []);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function record(type, ok, firstTry) {
  const st = stats()[type];
  if (firstTry) {
    st.n++;
    if (ok) st.correct++;
    st.recent.push(ok ? 1 : 0);
    if (st.recent.length > 30) st.recent.shift();
  }
  st.streak = ok ? st.streak + 1 : 0;
  st.best = Math.max(st.best, st.streak);
  const days = (app.store.trainDays ||= {});
  const d = (days[today()] ||= { n: 0, correct: 0 });
  if (firstTry) {
    d.n++;
    if (ok) d.correct++;
  }
  app.saveStore();
}
function recentAcc(type) {
  const r = stats()[type].recent;
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

// ---------- 공용 그리기 ----------
const seatName = (players) => (s) => (s === 0 ? "나" : players > 2 ? `${s}번 상대` : "상대");

function scene(obs, { players, selectable = false, onToggle, selected = new Set(), marks = {}, showTop = true } = {}) {
  const name = seatName(players || obs.num_players);
  const wrap = el("div", "t-scene");
  const opps = el("div", "t-opps");
  for (let s = 1; s < obs.num_players; s++) {
    const o = el("div", "t-opp");
    o.innerHTML = `<span class="t-opp-name">${name(s)}</span><span class="t-opp-count"><b>${obs.hand_counts[s]}</b>장</span>${obs.registered[s] ? '<span class="tag">등록</span>' : ""}`;
    opps.appendChild(o);
  }
  wrap.appendChild(opps);
  const mid = el("div", "t-mid");
  if (showTop) {
    const pile = el("div", "t-pile");
    pile.appendChild(obs.discard_top ? cardEl(obs.discard_top, { size: "md" }) : cardBack("md"));
    pile.appendChild(el("span", "t-label", "버림패 맨 위"));
    mid.appendChild(pile);
  }
  const melds = el("div", "t-melds");
  if (!obs.melds.length) melds.appendChild(el("span", "t-label", "바닥 조합 없음"));
  obs.melds.forEach((m) => {
    const g = el("div", "t-meld");
    g.appendChild(el("span", "t-label", name(m.owner)));
    const row = el("div", "row");
    sortCards(m.cards).forEach((c) => row.appendChild(cardEl(c, { size: "xs" })));
    g.appendChild(row);
    melds.appendChild(g);
  });
  mid.appendChild(melds);
  wrap.appendChild(mid);
  const hand = el("div", "t-hand");
  sortCards(obs.hand).forEach((c) => {
    const card = cardEl(c, { button: selectable, size: "lg", mark: marks[c] || "" });
    if (selected.has(c)) card.classList.add("selected");
    if (selectable) card.addEventListener("click", () => onToggle(c));
    else if (card.tagName === "BUTTON") card.disabled = true;
    hand.appendChild(card);
  });
  wrap.appendChild(hand);
  const foot = el("div", "t-foot");
  foot.innerHTML = `내 손패 <b>${obs.hand_points}</b>점 · ${obs.phase === "turn_start" ? "차례 시작 (받기 전)" : "받은 뒤"}`;
  wrap.appendChild(foot);
  return wrap;
}

function btn(text, onClick, cls = "") {
  const b = el("button", cls, text);
  b.addEventListener("click", onClick);
  return b;
}

function feedback(ok, title, lines = [], extra = null) {
  const box = el("div", `t-feedback ${ok ? "ok" : "bad"}`);
  box.setAttribute("role", "status");
  box.appendChild(el("div", "t-fb-title", `${ok ? "✓ 정답" : "✕ 오답"} · ${title}`));
  if (lines.length) {
    const ul = el("ul");
    lines.forEach((t) => ul.appendChild(el("li", "", t)));
    box.appendChild(ul);
  }
  if (extra) box.appendChild(extra);
  return box;
}

function bars(scored, obs, players, mineAction) {
  const name = seatName(players);
  const box = el("div", "alts");
  scored.slice(0, 6).forEach((v, i) => {
    const row = el("div", "alt" + (v.action === mineAction ? " is-mine" : "") + (i === 0 ? " is-best" : ""));
    const label = el("div", "alt-label", actionText(v.action, obs, name));
    if (v.action === mineAction) label.appendChild(el("span", "tag", "내 답"));
    if (i === 0) label.appendChild(el("span", "tag good", "최선"));
    const bar = el("div", "alt-bar");
    const fill = el("div", "alt-fill");
    fill.style.width = `${Math.max(1, v.value * 100)}%`;
    bar.appendChild(fill);
    row.append(label, bar, el("div", "alt-val", `${(v.value * 100).toFixed(1)}%`));
    box.appendChild(row);
  });
  return box;
}

const okGap = (v) => !(v.gap > 2 * v.gap_se && v.gap >= 0.02);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ---------- 문제 유형별 ----------
function renderMeld(stage, P, done) {
  const obs = P.obs;
  const sel = new Set();
  const groups = [];
  const used = () => new Set(groups.flat());
  const prompt = el("div", "t-prompt");
  prompt.innerHTML = `<b>받은 뒤입니다.</b> 등록할 조합을 <b>전부</b> 찾아 묶으세요. 겹치지 않게, 손패 점수를 가장 많이 덜어내는 묶음이 정답입니다.`;
  const sceneBox = el("div");
  const chips = el("div", "t-groups");
  const msg = el("div", "t-msg");
  const actions = el("div", "t-actions");
  const redraw = () => {
    sceneBox.innerHTML = "";
    const marks = {};
    used().forEach((c) => (marks[c] = "group"));
    sceneBox.appendChild(scene(obs, { players: P.players, selectable: !current.answered, selected: sel, marks, showTop: false, onToggle: (c) => {
      if (used().has(c)) return;
      if (sel.has(c)) sel.delete(c); else sel.add(c);
      msg.textContent = "";
      redraw();
    } }));
    chips.innerHTML = "";
    groups.forEach((g, i) => {
      const chip = el("div", "t-chip");
      sortCards(g).forEach((c) => chip.appendChild(cardEl(c, { size: "xs" })));
      chip.appendChild(el("span", "t-chip-pts", `${g.reduce((s, c) => s + points(c), 0)}점`));
      if (!current.answered) {
        const x = btn("✕", () => { groups.splice(i, 1); redraw(); }, "t-chip-x");
        x.setAttribute("aria-label", "묶음 풀기");
        chip.appendChild(x);
      }
      chips.appendChild(chip);
    });
    if (!groups.length) chips.appendChild(el("span", "t-label muted", "아직 묶은 조합이 없다"));
  };
  const bind = () => {
    const cards = [...sel];
    if (!cards.length) return (msg.textContent = "묶을 카드를 고르세요");
    if (!meldKind(cards.join(" "))) return (msg.textContent = "조합이 아니다: 같은 숫자 3장 이상 · 같은 무늬 연속 3장 이상(K-A-2 순환 가능) · 7 한 장");
    groups.push(cards);
    sel.clear();
    msg.textContent = "";
    redraw();
  };
  const submit = () => {
    const covered = groups.flat().reduce((s, c) => s + points(c), 0);
    const best = P.answer.covered;
    const ok = covered === best;
    const lines = ok
      ? [`덜어낸 점수 ${covered}점 — 최선이다. 남는 손패 ${obs.hand_points - covered}점.`]
      : [`덜어낸 점수 ${covered}점 / 최선 ${best}점. 남는 손패가 ${obs.hand_points - covered}점이 아니라 ${P.answer.left}점이 될 수 있었다.`];
    const ans = el("div", "t-answer");
    ans.appendChild(el("div", "t-label", "최선의 묶음"));
    const row = el("div", "t-groups");
    P.answer.melds.forEach((m) => {
      const chip = el("div", "t-chip best");
      sortCards(m).forEach((c) => chip.appendChild(cardEl(c, { size: "xs" })));
      chip.appendChild(el("span", "t-chip-pts", `${m.reduce((s, c) => s + points(c), 0)}점`));
      row.appendChild(chip);
    });
    ans.appendChild(row);
    if (!ok) {
      const missed = P.answer.melds.flat().filter((c) => !used().has(c));
      if (missed.length) lines.push(`놓친 카드: ${cardsText(sortCards(missed))}`);
      if (P.answer.melds.some((m) => m.length === 1)) lines.push("7은 한 장만으로도 등록할 수 있다.");
      if (P.answer.melds.some((m) => m.length >= 3 && new Set(m.map((c) => c.slice(-1))).size === 1 && m.some((c) => c[0] === "A") && m.some((c) => c[0] === "K"))) {
        lines.push("A는 K와도 이어진다 (Q-K-A, K-A-2 순환 가능).");
      }
    }
    done(ok, feedback(ok, `${groups.length}개 묶음`, lines, ans));
  };
  actions.append(btn("선택한 카드 묶기", bind, "tonal"), btn("제출", submit, "primary"));
  stage.append(prompt, sceneBox, chips, msg, actions);
  redraw();
  return submit;
}

function renderThankYou(stage, P, done) {
  const obs = P.obs;
  const sel = new Set();
  const prompt = el("div", "t-prompt");
  prompt.innerHTML = `<b>차례 시작, 받기 전입니다.</b> 버림패 맨 위 <b>${cardText(obs.thank_you_target)}</b>로 땡큐할 수 있으면 함께 등록할 <b>내 카드</b>를 고르고 '땡큐', 안 되면 '받기'.`;
  const sceneBox = el("div");
  const msg = el("div", "t-msg");
  const redraw = () => {
    sceneBox.innerHTML = "";
    sceneBox.appendChild(scene(obs, { players: P.players, selectable: !current.answered, selected: sel, onToggle: (c) => {
      if (sel.has(c)) sel.delete(c); else sel.add(c);
      msg.textContent = "";
      redraw();
    } }));
  };
  const name = seatName(P.players);
  const options = P.options.map((a) => parseAction(a).cards);
  const bestOpt = options.length
    ? options.reduce((b, o) => (o.filter((c) => obs.hand.includes(c)).reduce((s, c) => s + points(c), 0) > b.filter((c) => obs.hand.includes(c)).reduce((s, c) => s + points(c), 0) ? o : b))
    : null;
  const explain = () => options.length
    ? [`가능한 땡큐: ${P.options.map((a) => actionText(a, obs, name)).join(" · ")}`, `가장 많이 덜어내는 땡큐: ${cardsText(sortCards(bestOpt))} (손패 −${bestOpt.filter((c) => obs.hand.includes(c)).reduce((s, c) => s + points(c), 0)}점)`]
    : [`${cardText(obs.thank_you_target)}와 내 카드 2장으로 만들 수 있는 세트나 런이 없다. 받는다.`];
  const answer = (choice) => {
    let ok;
    let title;
    if (choice === "draw") {
      ok = options.length === 0;
      title = ok ? "땡큐 불가를 알아봤다" : "땡큐 기회를 놓쳤다";
    } else {
      const picked = [...sel, obs.thank_you_target];
      if (sel.size < 2) return (msg.textContent = "버림패 카드와 함께 등록할 내 카드를 2장 이상 고르세요");
      ok = options.some((o) => sameSet(o, picked));
      title = ok ? "땡큐 성공" : options.length ? "그 카드들로는 조합이 안 된다" : "이 장면은 땡큐가 안 된다";
    }
    done(ok, feedback(ok, title, explain()));
  };
  const actions = el("div", "t-actions");
  actions.append(btn("땡큐", () => answer("ty"), "primary"), btn("받기", () => answer("draw"), "tonal"));
  stage.append(prompt, sceneBox, msg, actions);
  redraw();
  return () => answer(sel.size ? "ty" : "draw");
}

function renderStop(stage, P, done) {
  const obs = P.obs;
  const { fewest, limit, stop } = P.table;
  const prompt = el("div", "t-prompt");
  prompt.innerHTML = `<b>차례 시작.</b> 손패 <b>${obs.hand_points}점</b>. 지금 스톱할까요?`;
  const answer = (choice) => {
    const ok = (choice === "stop") === stop;
    const rule = limit === null ? `상대 최소 ${fewest}장 → 스톱 금지` : `상대 최소 ${fewest}장 → ${limit}점 이하면 스톱`;
    const lines = [
      `기준표: ${rule} → ${stop ? "스톱" : "기다림"}.`,
      `학습된 추정: 지금 스톱하면 이길 확률 약 ${Math.round(P.estimate * 100)}%.`,
      `실제 손패: ${P.points.slice(1).map((p, i) => `${seatName(P.players)(i + 1)} ${p}점`).join(", ")} → 지금 스톱했다면 ${P.truth ? "이겼다" : "졌다"}.`,
    ];
    if (P.truth !== stop) lines.push("이번 한 판의 결과는 기준표와 다르지만, 기준표는 수만 판 평균으로 가장 많이 이기는 판단이다.");
    done(ok, feedback(ok, ok ? "기준표대로" : "기준표와 다른 판단", lines));
  };
  const actions = el("div", "t-actions");
  actions.append(btn("스톱", () => answer("stop"), "danger"), btn("받기 (계속)", () => answer("draw"), "primary"));
  stage.append(prompt, scene(obs, { players: P.players }), actions);
  return null;
}

function renderDiscard(stage, P, done) {
  const obs = P.obs;
  let pick = null;
  const prompt = el("div", "t-prompt");
  prompt.innerHTML = `<b>등록·붙이기는 끝났습니다.</b> 버릴 카드 1장을 고르세요.`;
  const sceneBox = el("div");
  const msg = el("div", "t-msg");
  const redraw = () => {
    sceneBox.innerHTML = "";
    sceneBox.appendChild(scene(obs, { players: P.players, selectable: !current.answered, selected: new Set(pick ? [pick] : []), onToggle: (c) => { pick = c; msg.textContent = ""; redraw(); } }));
  };
  const submit = () => {
    if (!pick) return (msg.textContent = "버릴 카드를 고르세요");
    const mine = P.scored.find((v) => v.action === `discard ${pick}`);
    const ok = mine ? okGap(mine) : false;
    const best = parseAction(P.scored[0].action).cards[0];
    const unseen = unseenOf(obs);
    const ruleRows = sortCards(obs.hand)
      .map((c) => ({ c, s: discardScore(c, obs.hand, unseen), f: fragmentOf(c, obs.hand, unseen) }))
      .sort((a, b) => b.s - a.s);
    const ruleBest = ruleRows[0].c;
    const lines = [];
    if (ok) lines.push(pick === best ? `${cardText(pick)} — 최선이다.` : `${cardText(pick)} — 최선(${cardText(best)})과 확실한 차이가 없다.`);
    else lines.push(`${cardText(pick)}보다 ${cardText(best)}를 버리는 편이 추정 승률 ${(mine.gap * 100).toFixed(1)}%p 높다.`);
    const mf = fragmentOf(pick, obs.hand, unseen);
    if (!ok && mf) lines.push(`${cardText(pick)}는 ${cardText(mf.partner)}와 ${mf.kind} 이루는 조합 직전 카드였다 (살릴 카드 ${mf.outs.length}장 남음).`);
    if (!ok && points(best) > points(pick)) lines.push(`${cardText(best)}(${points(best)}점)가 더 무겁다. 무거운 카드부터 버린다.`);
    lines.push(ruleBest === best ? `규칙(점수 − 살릴 카드 수×3)으로도 ${cardText(ruleBest)}가 1위다.` : `규칙 1위는 ${cardText(ruleBest)}지만, 이 장면은 시뮬레이션이 ${cardText(best)}를 더 높게 본다.`);
    const extra = el("div");
    extra.appendChild(el("div", "t-label", "규칙 점수 (점수 − 살릴 카드 수 × 3)"));
    const table = el("div", "t-rule");
    ruleRows.forEach((r) => {
      const d = el("div", "t-rule-row" + (r.c === pick ? " mine" : "") + (r.c === best ? " best" : ""));
      d.appendChild(cardEl(r.c, { size: "xs" }));
      d.appendChild(el("span", "", `${points(r.c)}점 − ${r.f ? r.f.outs.length : 0}×3 = ${r.s}`));
      table.appendChild(d);
    });
    extra.appendChild(table);
    extra.appendChild(el("div", "t-label", "시뮬레이션 추정 승률"));
    extra.appendChild(bars(P.scored, obs, P.players, `discard ${pick}`));
    done(ok, feedback(ok, ok ? "좋은 버림" : "더 나은 버림이 있다", lines, extra));
  };
  const actions = el("div", "t-actions");
  actions.append(btn("버리기", submit, "primary"));
  stage.append(prompt, sceneBox, msg, actions);
  redraw();
  return submit;
}

function renderNotebookItem(stage, N, done) {
  const obs = N.obs;
  const players = obs.num_players;
  const name = seatName(players);
  const prompt = el("div", "t-prompt");
  prompt.innerHTML = `<b>오답 노트.</b> 예전에 틀린 장면입니다. 최선의 수를 고르세요.`;
  const opts = [...N.scored].sort(() => Math.random() - 0.5);
  const actions = el("div", "t-options");
  opts.forEach((v, i) => {
    const b = btn(`${i + 1}. ${actionText(v.action, obs, name)}`, () => {
      const ok = okGap(v);
      const lines = [ok ? "최선이거나 최선과 확실한 차이가 없는 수다." : `최선은 ${actionText(N.best, obs, name)}.`, ...(N.lines || [])];
      done(ok, feedback(ok, ok ? "이번엔 맞혔다" : "다시 틀렸다", lines, bars(N.scored.slice().sort((a, b) => b.value - a.value), obs, players, v.action)));
    }, "t-option");
    b.dataset.key = String(i + 1);
    actions.appendChild(b);
  });
  stage.append(prompt, scene(obs, { players }), actions);
  return null;
}

// ---------- 세션 ----------
function mixPlan() {
  const st = stats();
  const types = ["meld", "thankyou", "stop", "discard"];
  const weight = (t) => {
    const acc = recentAcc(t);
    return 1 + (acc === null ? 1 : (1 - acc) * 3);
  };
  const plan = [];
  const nb = notebook().length;
  for (let i = 0; i < SESSION_LEN; i++) {
    if (nb && i % 4 === 3) {
      plan.push("notebook");
      continue;
    }
    const total = types.reduce((s, t) => s + weight(t), 0);
    let x = Math.random() * total;
    plan.push(types.find((t) => (x -= weight(t)) < 0) || "meld");
  }
  void st;
  return plan;
}

function startSession(kind) {
  const plan = kind === "mix" ? mixPlan() : Array(kind === "notebook" ? Math.min(SESSION_LEN, notebook().length) : SESSION_LEN).fill(kind);
  if (!plan.length) return;
  session = { kind, plan, i: 0, results: [], retries: [], started: Date.now(), nbUsed: new Set() };
  ["meld", "thankyou", "stop", "discard"].forEach((t) => plan.includes(t) && prefetch(t));
  showStage();
  nextQuestion();
}

function pickNotebook() {
  const list = notebook();
  const fresh = list.filter((n) => !session.nbUsed.has(n.key));
  if (!fresh.length) return null;
  fresh.sort((a, b) => (a.solved || 0) - (b.solved || 0) || (a.at < b.at ? -1 : 1));
  session.nbUsed.add(fresh[0].key);
  return fresh[0];
}

async function nextQuestion() {
  const stage = $("t-stage");
  stage.innerHTML = "";
  const due = session.retries.findIndex((r) => r.due <= session.i);
  let type;
  let puzzle;
  let retry = false;
  if (due >= 0) {
    ({ type, puzzle } = session.retries.splice(due, 1)[0]);
    retry = true;
  } else if (session.i < session.plan.length) {
    type = session.plan[session.i];
  } else if (session.retries.length) {
    ({ type, puzzle } = session.retries.shift());
    retry = true;
  } else {
    return finishSession();
  }
  if (!puzzle) {
    if (type === "notebook") {
      puzzle = pickNotebook();
      if (!puzzle) {
        session.i++;
        return nextQuestion();
      }
    } else {
      stage.appendChild(el("div", "t-loading", "문제 만드는 중…"));
      puzzle = await take(type);
      if (puzzle.error) {
        stage.innerHTML = "";
        stage.appendChild(el("p", "t-msg", `문제를 만들지 못했다: ${puzzle.error}`));
        session.i++;
        stage.appendChild(btn("다음 문제 →", () => nextQuestion(), "primary"));
        return;
      }
      stage.innerHTML = "";
    }
  }
  if (!retry) session.i++;
  current = { type, puzzle, answered: false, started: Date.now(), retry };
  renderProgress();
  const head = el("div", "t-qhead");
  const d = DRILLS[type];
  head.innerHTML = `<span class="t-badge">${d.icon} ${d.title}</span>${retry ? '<span class="tag">다시 풀기</span>' : ""}<span class="t-rule-hint">${d.rule}</span>`;
  stage.appendChild(head);
  const body = el("div", "t-body");
  stage.appendChild(body);
  const done = (ok, fb) => onAnswered(ok, fb);
  const render = { meld: renderMeld, thankyou: renderThankYou, stop: renderStop, discard: renderDiscard, notebook: renderNotebookItem }[type];
  current.submit = render(body, puzzle, done);
}

function onAnswered(ok, fb) {
  if (current.answered) return;
  current.answered = true;
  const { type, puzzle, retry } = current;
  const ms = Date.now() - current.started;
  record(type, ok, !retry);
  if (!retry) session.results.push({ type, ok, ms });
  if (type === "notebook") {
    puzzle.solved = (puzzle.solved || 0) + (ok ? 1 : 0);
    if (puzzle.solved >= 2) {
      const list = notebook();
      const i = list.indexOf(puzzle);
      if (i >= 0) list.splice(i, 1);
    }
    app.saveStore();
  } else if (!ok) {
    if (!retry) session.retries.push({ type, puzzle, due: session.i + RETRY_GAP });
    saveWrongPuzzle(type, puzzle);
  }
  // 입력 잠그기 (다시 그려 선택 비활성화)
  document.querySelectorAll("#t-stage .t-actions button, #t-stage .t-options button").forEach((b) => (b.disabled = true));
  document.querySelectorAll("#t-stage button.card").forEach((b) => (b.disabled = true));
  const stage = $("t-stage");
  stage.appendChild(fb);
  const nav = el("div", "t-next");
  nav.appendChild(el("span", "t-time", `${(ms / 1000).toFixed(1)}초`));
  nav.appendChild(btn("다음 문제 →", () => nextQuestion(), "primary"));
  stage.appendChild(nav);
  fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  renderProgress();
}

function saveWrongPuzzle(type, puzzle) {
  // 생성 문제도 오답 노트에 보관 (선택지형으로 다시 풀 수 있게 최소 정보만)
  if (type === "discard") {
    const obs = puzzle.obs;
    notebook().push({
      key: `p-${Date.now()}`,
      obs,
      scored: puzzle.scored.slice(0, 5),
      best: puzzle.scored[0].action,
      lines: ["훈련 · 버릴 카드에서 틀린 장면"],
      category: "discard",
      at: new Date().toISOString(),
      solved: 0,
    });
  } else if (type === "stop") {
    const obs = puzzle.obs;
    const stopV = { action: "stop", value: puzzle.table.stop ? 1 : 0, stderr: 0, gap: puzzle.table.stop ? 0 : 1, gap_se: 0 };
    const drawV = { action: "draw", value: puzzle.table.stop ? 0 : 1, stderr: 0, gap: puzzle.table.stop ? 1 : 0, gap_se: 0 };
    const t = puzzle.table;
    notebook().push({
      key: `p-${Date.now()}`,
      obs,
      scored: puzzle.table.stop ? [stopV, drawV] : [drawV, stopV],
      best: puzzle.table.stop ? "stop" : "draw",
      lines: [`스톱 기준표: 상대 최소 ${t.fewest}장 → ${t.limit === null ? "스톱 금지" : `${t.limit}점 이하 스톱`}.`],
      category: "stop",
      at: new Date().toISOString(),
      solved: 0,
    });
  }
  if (notebook().length > 200) notebook().splice(0, notebook().length - 200);
  app.saveStore();
}

function renderProgress() {
  const bar = $("t-progress");
  if (!session) return;
  const total = session.plan.length;
  const doneN = session.results.length;
  const correct = session.results.filter((r) => r.ok).length;
  bar.innerHTML = "";
  const track = el("div", "t-track");
  for (let i = 0; i < total; i++) {
    const r = session.results[i];
    track.appendChild(el("span", "t-dot" + (r ? (r.ok ? " ok" : " bad") : i === doneN ? " now" : "")));
  }
  bar.appendChild(track);
  bar.appendChild(el("span", "t-score", `${correct} / ${doneN}${session.retries.length ? ` · 다시 풀 문제 ${session.retries.length}` : ""}`));
}

function finishSession() {
  const stage = $("t-stage");
  stage.innerHTML = "";
  const res = session.results;
  const correct = res.filter((r) => r.ok).length;
  const box = el("div", "t-summary");
  box.appendChild(el("div", "t-summary-score", `${correct} / ${res.length}`));
  box.appendChild(el("div", "t-label", `정답률 ${res.length ? Math.round((correct / res.length) * 100) : 0}% · 평균 ${(res.reduce((s, r) => s + r.ms, 0) / Math.max(1, res.length) / 1000).toFixed(1)}초`));
  const by = {};
  res.forEach((r) => {
    const x = (by[r.type] ||= { n: 0, ok: 0 });
    x.n++;
    if (r.ok) x.ok++;
  });
  const list = el("div", "t-summary-list");
  Object.entries(by).forEach(([t, x]) => {
    const row = el("div", "t-summary-row");
    row.innerHTML = `<span>${DRILLS[t].icon} ${DRILLS[t].title}</span><b>${x.ok} / ${x.n}</b>`;
    list.appendChild(row);
  });
  box.appendChild(list);
  const nav = el("div", "t-actions");
  const kind = session.kind;
  nav.append(btn("한 번 더", () => startSession(kind), "primary"), btn("훈련 홈", () => showHome(), "tonal"));
  box.appendChild(nav);
  stage.appendChild(box);
  session = null;
  $("t-progress").innerHTML = "";
}

// ---------- 홈 ----------
export function showHome() {
  session = null;
  current = null;
  $("t-home").hidden = false;
  $("t-session").hidden = true;
  const st = stats();
  const grid = $("t-drills");
  grid.innerHTML = "";
  const order = ["meld", "thankyou", "stop", "discard", "notebook"];
  let weakest = null;
  for (const t of ["meld", "thankyou", "stop", "discard"]) {
    const a = recentAcc(t);
    if (a !== null && (weakest === null || a < weakest.a)) weakest = { t, a };
  }
  order.forEach((t) => {
    const d = DRILLS[t];
    const card = el("button", "t-drill");
    const s = st[t];
    const acc = recentAcc(t);
    const nb = notebook().length;
    const meta = t === "notebook" ? `${nb}개 대기` : s.n ? `최근 정답률 ${Math.round(acc * 100)}% · ${s.n}문제 · 최고 연속 ${s.best}` : "아직 안 풀어 봤다";
    card.innerHTML = `<span class="t-drill-icon">${d.icon}</span><span class="t-drill-title">${d.title}</span><span class="t-drill-rule">${d.rule}</span><span class="t-drill-meta">${meta}</span>${acc !== null && t !== "notebook" ? `<span class="t-drill-bar"><span style="width:${acc * 100}%"></span></span>` : ""}`;
    if (t === "notebook" && !nb) card.disabled = true;
    card.addEventListener("click", () => startSession(t));
    grid.appendChild(card);
  });
  const days = app.store.trainDays || {};
  const d = days[today()] || { n: 0, correct: 0 };
  $("t-today").textContent = d.n ? `오늘 ${d.n}문제 · 정답률 ${Math.round((d.correct / d.n) * 100)}%` : "오늘은 아직 안 풀었다";
  $("t-reco").textContent = weakest && weakest.a < 0.85 ? `추천: ${DRILLS[weakest.t].title} (최근 정답률 ${Math.round(weakest.a * 100)}%)` : "섞어 풀기로 고르게 연습하세요";
  ["meld", "thankyou", "stop", "discard"].forEach(prefetch);
}

function showStage() {
  $("t-home").hidden = true;
  $("t-session").hidden = false;
}

export function initTraining(ctx) {
  app = ctx;
  $("t-start").addEventListener("click", () => startSession("mix"));
  $("t-exit").addEventListener("click", () => showHome());
  onKey = (e) => {
    if ($("train-view").hidden || !session || !current) return;
    if (e.key === "Enter") {
      const next = document.querySelector("#t-stage .t-next button");
      if (current.answered && next) {
        e.preventDefault();
        next.click();
      } else if (!current.answered && current.submit) {
        e.preventDefault();
        current.submit();
      }
    } else if (/^[1-9]$/.test(e.key) && !current.answered) {
      const opt = document.querySelector(`#t-stage .t-option[data-key="${e.key}"]`);
      if (opt) opt.click();
    } else if (e.key === "Escape") {
      showHome();
    }
  };
  document.addEventListener("keydown", onKey);
}
