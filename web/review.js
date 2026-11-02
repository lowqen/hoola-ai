// 판 복기: 결정마다 L3 평가 → 등급 · 장면 · 이유 · 대안 · 승률 흐름.
import {
  STOP_TABLE, RANK_ORDER, actionText, cardEl, cardBack, cardText, cardsText, el, parseAction,
  points, rankNum, sortCards, suitOf,
} from "./common.js";

const REVIEW_K = 160;
const GRADES = [
  { id: "blunder", min: 0.1, label: "블런더", icon: "✕", color: "#d03b3b" },
  { id: "mistake", min: 0.05, label: "실수", icon: "!", color: "#ec835a" },
  { id: "inaccuracy", min: 0.02, label: "부정확", icon: "?", color: "#fab219" },
  { id: "good", min: 0, label: "좋음", icon: "✓", color: "#0ca30c" },
];
const BEST = { id: "best", label: "최선", icon: "★", color: "#0ca30c" };
/** 스톱 기준표대로 둔 스톱 판단: 시뮬레이션과 달라도 실수로 세지 않는다. */
const TABLE = { id: "table", label: "기준표대로", icon: "≡", color: "#7a7a72" };

/** 이 결정이 "스톱할까 말까"의 문제이고, 내가 기준표와 같은 판단을 했는가. */
export function stopTableCheck(obs, myAction, bestAction, legal, seat) {
  if (obs.phase !== "turn_start" || !legal.includes("stop")) return null;
  const fewest = Math.min(7, ...obs.hand_counts.filter((_, s) => s !== seat));
  const limit = STOP_TABLE[fewest];
  const tableStop = limit !== null && obs.hand_points <= limit;
  const mineStop = myAction === "stop";
  const bestStop = bestAction === "stop";
  return { fewest, limit, tableStop, followed: mineStop === tableStop, aboutStop: mineStop !== bestStop };
}
const CATEGORY = {
  stop: "스톱 판단",
  thankyou: "땡큐",
  meld: "등록·붙이기",
  discard: "버림 선택",
  other: "기타",
};

const $ = (id) => document.getElementById(id);
let worker = null;
let jobCounter = 0;

function getWorker() {
  if (!worker) worker = new Worker(new URL("./review-worker.js", import.meta.url), { type: "module" });
  return worker;
}

// ---------- 분석 ----------

function gradeOf(item) {
  const mine = item.mine;
  if (!mine) return GRADES[3];
  if (mine.gap <= 1e-12) return BEST;
  const sig = mine.gap > 2 * mine.gap_se;
  const loss = sig ? mine.gap : 0;
  return GRADES.find((g) => loss >= g.min);
}

function lossOf(item) {
  const m = item.mine;
  return m && m.gap > 2 * m.gap_se ? m.gap : 0;
}

function unseenOf(obs) {
  const seen = new Set([...obs.hand, ...obs.known_discards, ...obs.melds.flatMap((m) => m.cards)]);
  const all = [];
  for (const s of "SHDC") for (const r of RANK_ORDER) all.push(r + s);
  return new Set(all.filter((c) => !seen.has(c)));
}

const cardOf = (rank, suit) => (rank >= 1 && rank <= 13 ? RANK_ORDER[rank - 1] + suit : null);

/** card가 손패의 다른 카드와 2장 조각을 이루면 {kind, partner, outs[]} (아웃이 가장 많은 것). */
function fragmentOf(card, hand, unseen) {
  const others = hand.filter((c) => c !== card);
  const r = rankNum(card);
  const s = suitOf(card);
  const cands = [];
  const same = others.filter((c) => rankNum(c) === r);
  if (same.length) {
    cands.push({ kind: "페어를", partner: same[0], outs: [...unseen].filter((c) => rankNum(c) === r) });
  }
  for (const d of [1, -1, 2, -2]) {
    const partner = others.find((c) => suitOf(c) === s && rankNum(c) === r + d);
    if (!partner) continue;
    const lo = Math.min(r, r + d);
    const hi = Math.max(r, r + d);
    const need = Math.abs(d) === 1 ? [lo - 1, hi + 1] : [lo + 1];
    const outs = need.map((x) => cardOf(x, s)).filter((c) => c && unseen.has(c));
    cands.push({ kind: Math.abs(d) === 1 ? "연속을" : "한 칸 건너뛴 연속을", partner, outs });
  }
  cands.sort((a, b) => b.outs.length - a.outs.length);
  return cands.length && cands[0].outs.length > 0 ? cands[0] : null;
}

function fewestOpp(obs, seat) {
  return Math.min(7, ...obs.hand_counts.filter((_, s) => s !== seat));
}

/** 내 수와 추천 수를 비교해 직관적인 이유를 만든다. */
function explain(item, ctx) {
  const { obs, mine, best } = item;
  const seat = ctx.seat;
  const m = parseAction(mine.action);
  const b = parseAction(best.action);
  const pts = obs.hand_points;
  const fewest = fewestOpp(obs, seat);
  const limit = STOP_TABLE[fewest];
  const tableText = limit === null ? `상대 최소 ${fewest}장 → 스톱 금지` : `상대 최소 ${fewest}장 → ${limit}점 이하 스톱`;
  const name = (a) => actionText(a, obs, ctx.seatName);
  const lines = [];
  let category = "other";

  if (b.verb === "stop" && m.verb !== "stop") {
    // 기준표와 다르게(스톱 안 함) 둔 경우에만 여기로 온다
    category = "stop";
    lines.push(`스톱할 장면이었다. 손패 ${pts}점이고 가장 적게 든 상대가 ${fewest}장이다.`);
    lines.push(`스톱 기준표(${tableText})에 해당한다. 기다리면 상대가 털거나 점수를 더 낮출 시간을 준다.`);
  } else if (m.verb === "stop" && b.verb !== "stop") {
    category = "stop";
    lines.push(`스톱이 일렀다. 손패 ${pts}점인데 가장 적게 든 상대가 ${fewest}장이라, 그 상대가 나보다 낮거나 같을 가능성이 크다 (같아도 선언자 패배).`);
    lines.push(`스톱 기준표: ${tableText}.`);
    if (ctx.outcome?.reason === "stop-fail" && ctx.isLast) lines.push("실제로 이 스톱은 실패했다.");
  } else if (b.verb === "thankyou" && m.verb !== "thankyou") {
    category = "thankyou";
    const gain = b.cards.filter((c) => obs.hand.includes(c)).reduce((s, c) => s + points(c), 0);
    lines.push(`땡큐 기회를 놓쳤다: ${cardsText(sortCards(b.cards))}.`);
    lines.push(`받는 대신 버림패를 가져와 바로 등록하면 손패가 ${gain}점 줄고 등록 상태가 되어 붙이기도 할 수 있었다.`);
  } else if (m.verb === "thankyou" && b.verb !== "thankyou") {
    category = "thankyou";
    lines.push(`이 땡큐는 손해였다. 추천: ${name(best.action)}.`);
    lines.push("가져온 조합 때문에 더 좋은 조합의 재료를 썼거나, 받기로 얻을 기회가 더 컸다.");
  } else if (b.verb === "register" && m.verb !== "register") {
    category = "meld";
    const gain = b.cards.reduce((s, c) => s + points(c), 0);
    lines.push(`등록할 수 있는 조합을 놓쳤다: ${cardsText(sortCards(b.cards))} (손패 −${gain}점).`);
    lines.push("조합은 생기는 즉시 내려놓는 게 유리하다. 손패 점수가 낮아져야 내 스톱이 가능해지고 상대 스톱에도 지지 않는다.");
  } else if (b.verb === "attach" && m.verb !== "attach") {
    category = "meld";
    lines.push(`바닥 조합에 붙일 수 있는 ${cardText(b.cards[0])}(${points(b.cards[0])}점)를 놓쳤다: ${name(best.action)}.`);
  } else if (m.verb === "register" && b.verb !== "register") {
    category = "meld";
    lines.push(`이 조합은 지금 등록하지 않는 편이 나았다. 추천: ${name(best.action)}.`);
  } else if (m.verb === "discard" && b.verb === "discard") {
    category = "discard";
    const mc = m.cards[0];
    const bc = b.cards[0];
    const unseen = unseenOf(obs);
    const mf = fragmentOf(mc, obs.hand, unseen);
    const bf = fragmentOf(bc, obs.hand, unseen);
    if (mf && !bf) {
      lines.push(`${cardText(mc)}는 ${cardText(mf.partner)}와 ${mf.kind} 이루는 조합 직전 카드였다. 살려 줄 카드 ${mf.outs.length}장(${cardsText(sortCards(mf.outs))})이 아직 안 나왔다.`);
      lines.push(`조합과 상관없는 ${cardText(bc)}(${points(bc)}점)를 버렸어야 했다.`);
    } else if (points(bc) > points(mc) && !bf) {
      lines.push(`${cardText(bc)}(${points(bc)}점)가 ${cardText(mc)}(${points(mc)}점)보다 무겁고 조합에도 쓰이지 않는다.`);
      lines.push("무거운 카드부터 버려야 손패 점수가 빨리 내려가 스톱이 가능해지고, 상대 스톱에도 안전하다.");
    } else if (bf && mf && bf.outs.length < mf.outs.length) {
      lines.push(`둘 다 조합 직전 카드지만 ${cardText(mc)} 쪽 조각이 살릴 카드가 더 많다 (${mf.outs.length}장 vs ${bf.outs.length}장).`);
    } else if (points(bc) < points(mc)) {
      lines.push(`더 가벼운 ${cardText(bc)}를 버리고 ${cardText(mc)}를 남기는 편이 나았다. 남은 패와 조합될 가능성이나 다음 사람의 땡큐 가능성이 차이를 만든 장면이다.`);
    } else {
      lines.push(`시뮬레이션상 ${cardText(bc)}를 버리는 편이 유리했다.`);
    }
    if (ctx.nextTookMyDiscard) lines.push(`실제로 다음 사람이 버린 ${cardText(mc)}를 땡큐해 갔다.`);
  } else {
    lines.push(`추천: ${name(best.action)}.`);
  }
  return { category, lines };
}

// ---------- 화면 ----------

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function badge(grade) {
  const b = el("span", `grade grade-${grade.id}`);
  b.innerHTML = `<span class="gi" aria-hidden="true">${grade.icon}</span>${grade.label}`;
  return b;
}

function renderScene(item, ctx) {
  const { obs, mine, best } = item;
  const wrap = el("div", "scene");
  // 상대
  const opps = el("div", "scene-opps");
  for (let s = 0; s < obs.num_players; s++) {
    if (s === ctx.seat) continue;
    const chip = el("div", "scene-opp");
    chip.innerHTML = `<b>${ctx.seatName(s)}</b> ${obs.hand_counts[s]}장${obs.registered[s] ? ' · <span class="tag">등록</span>' : ""}`;
    opps.appendChild(chip);
  }
  wrap.appendChild(opps);
  // 버림패·바닥
  const mid = el("div", "scene-mid");
  const top = el("div", "scene-pile");
  top.appendChild(obs.discard_top ? cardEl(obs.discard_top, { size: "sm" }) : cardBack("sm"));
  top.appendChild(el("span", "muted small", "버림패 맨 위"));
  mid.appendChild(top);
  const melds = el("div", "scene-melds");
  obs.melds.forEach((m) => {
    const g = el("div", "scene-meld");
    g.appendChild(el("span", "muted xsmall", ctx.seatName(m.owner)));
    const row = el("div", "row");
    sortCards(m.cards).forEach((c) => row.appendChild(cardEl(c, { size: "xs" })));
    g.appendChild(row);
    melds.appendChild(g);
  });
  if (!obs.melds.length) melds.appendChild(el("span", "muted small", "바닥 조합 없음"));
  mid.appendChild(melds);
  wrap.appendChild(mid);
  // 내 손패 (내 수 / 추천 표시)
  const mineCards = new Set(parseAction(mine.action).cards);
  const bestCards = new Set(parseAction(best.action).cards);
  const hand = el("div", "scene-hand");
  sortCards(obs.hand).forEach((c) => {
    const mark = mineCards.has(c) && !bestCards.has(c) ? "mine" : bestCards.has(c) && !mineCards.has(c) ? "best" : mineCards.has(c) ? "both" : "";
    hand.appendChild(cardEl(c, { size: "md", mark }));
  });
  const hl = el("div", "scene-hand-wrap");
  hl.appendChild(el("div", "muted small", `내 손패 ${obs.hand_points}점 · ${obs.phase === "turn_start" ? "차례 시작 (스톱/받기/땡큐)" : "등록·붙이기·버리기"}`));
  hl.appendChild(hand);
  const legend = el("div", "scene-legend xsmall");
  legend.innerHTML = '<span class="lg mine">내 수</span><span class="lg best">추천</span>';
  hl.appendChild(legend);
  wrap.appendChild(hl);
  return wrap;
}

function renderAlternatives(item, ctx) {
  const box = el("div", "alts");
  item.scored.slice(0, 5).forEach((v, i) => {
    const row = el("div", "alt" + (v.action === item.mine.action ? " is-mine" : "") + (i === 0 ? " is-best" : ""));
    const label = el("div", "alt-label");
    label.textContent = actionText(v.action, item.obs, ctx.seatName);
    if (v.action === item.mine.action) label.appendChild(el("span", "tag", "내 수"));
    if (i === 0) label.appendChild(el("span", "tag good", "추천"));
    const bar = el("div", "alt-bar");
    const fill = el("div", "alt-fill");
    fill.style.width = `${Math.max(1, v.value * 100)}%`;
    bar.appendChild(fill);
    const val = el("div", "alt-val", pct(v.value));
    row.append(label, bar, val);
    box.appendChild(row);
  });
  return box;
}

function renderDetail(state, idx) {
  const detail = $("rv-detail");
  detail.innerHTML = "";
  const item = state.items[idx];
  if (!item) return;
  state.selected = idx;
  document.querySelectorAll(".rv-list li").forEach((li) => li.classList.toggle("active", +li.dataset.i === idx));
  document.querySelectorAll(".rv-chart .pt").forEach((p) => p.classList.toggle("active", +p.dataset.i === idx));

  const head = el("div", "rv-detail-head");
  head.appendChild(badge(item.grade));
  head.appendChild(el("span", "muted", `${item.n}번째 결정 · ${item.obs.turn}턴`));
  if (item.loss > 0) head.appendChild(el("span", "loss", `승률 −${(item.loss * 100).toFixed(1)}%p`));
  detail.appendChild(head);

  const cmp = el("div", "rv-compare");
  const mineBox = el("div", "cmp mine");
  mineBox.innerHTML = `<div class="cmp-k">내 수</div><div class="cmp-v">${actionText(item.mine.action, item.obs, state.ctx.seatName)}</div><div class="cmp-p">${pct(item.mine.value)}</div>`;
  const bestBox = el("div", "cmp best");
  bestBox.innerHTML = `<div class="cmp-k">추천</div><div class="cmp-v">${actionText(item.best.action, item.obs, state.ctx.seatName)}</div><div class="cmp-p">${pct(item.best.value)}</div>`;
  cmp.append(mineBox, bestBox);
  detail.appendChild(cmp);

  if (item.loss > 0) {
    const why = el("div", "why");
    why.appendChild(el("h4", "", `왜? · ${CATEGORY[item.category]}`));
    const ul = el("ul");
    item.lines.forEach((t) => ul.appendChild(el("li", "", t)));
    why.appendChild(ul);
    detail.appendChild(why);
  } else {
    const ok = el("div", "why ok");
    if (item.grade === TABLE) {
      ok.classList.add("table");
      item.lines.forEach((t) => ok.appendChild(el("p", "", t)));
    } else {
      ok.appendChild(el("p", "", item.grade.id === "best" ? "최선의 수였다." : "추천 수와 확실한 차이가 없다. 사실상 같은 수다."));
    }
    detail.appendChild(ok);
  }

  detail.appendChild(renderScene(item, state.ctx));
  detail.appendChild(el("h4", "", "다른 수와 비교 (추정 승률)"));
  detail.appendChild(renderAlternatives(item, state.ctx));

  const nav = el("div", "rv-nav");
  const errIdx = state.items.map((it, i) => (it.loss > 0 ? i : -1)).filter((i) => i >= 0);
  const prev = errIdx.filter((i) => i < idx).pop();
  const next = errIdx.find((i) => i > idx);
  const bPrev = el("button", "", "◀ 이전 실수");
  bPrev.disabled = prev === undefined;
  bPrev.onclick = () => renderDetail(state, prev);
  const bNext = el("button", "", "다음 실수 ▶");
  bNext.disabled = next === undefined;
  bNext.onclick = () => renderDetail(state, next);
  const bReplay = el("button", "primary", "이 장면부터 다시 두기");
  bReplay.onclick = () => {
    close();
    state.ctx.onReplayFrom(item.decision.index);
  };
  nav.append(bPrev, bNext, bReplay);
  detail.appendChild(nav);
  detail.appendChild(el("p", "muted xsmall", `추정치: 숨은 패 ${REVIEW_K}가지 × 수마다 끝까지 시뮬레이션. 손실은 같은 시뮬레이션끼리 비교해 95% 확실한 차이만 센다.`));
}

function renderList(state) {
  const list = $("rv-list");
  list.innerHTML = "";
  state.items.forEach((item, i) => {
    const li = el("li");
    li.dataset.i = i;
    li.appendChild(badge(item.grade));
    li.appendChild(el("span", "rv-li-text", actionText(item.mine.action, item.obs, state.ctx.seatName)));
    if (item.loss > 0) li.appendChild(el("span", "loss small", `−${(item.loss * 100).toFixed(1)}`));
    li.onclick = () => renderDetail(state, i);
    list.appendChild(li);
  });
}

/** 결정별 추정 승률 흐름 (단일 계열 선 + 등급 점, 호버 툴팁). */
function renderChart(state) {
  const fig = $("rv-chart");
  fig.innerHTML = "";
  const items = state.items;
  if (items.length < 2) return;
  const W = 720;
  const H = 170;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (items.length - 1);
  const y = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "결정마다의 추정 승률 흐름");
  const add = (tag, attrs, parent = svg) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  };
  for (const v of [0, 0.5, 1]) {
    add("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: "grid" });
    const t = add("text", { x: pad.l - 6, y: y(v) + 4, class: "axis", "text-anchor": "end" });
    t.textContent = `${v * 100}%`;
  }
  const fair = 1 / state.ctx.players;
  add("line", { x1: pad.l, x2: W - pad.r, y1: y(fair), y2: y(fair), class: "fair" });
  const ft = add("text", { x: W - pad.r, y: y(fair) - 4, class: "axis", "text-anchor": "end" });
  ft.textContent = `공평한 몫 ${(fair * 100).toFixed(0)}%`;
  add("polyline", { points: items.map((it, i) => `${x(i)},${y(it.mine.value)}`).join(" "), class: "line" });
  const tip = el("div", "chart-tip");
  tip.hidden = true;
  items.forEach((it, i) => {
    const g = add("g", { class: "pt", "data-i": i, tabindex: 0 });
    add("circle", { cx: x(i), cy: y(it.mine.value), r: 12, class: "hit" }, g);
    add("circle", { cx: x(i), cy: y(it.mine.value), r: it.loss > 0 ? 6 : 4.5, fill: it.grade.color, class: "dot" }, g);
    const show = () => {
      tip.hidden = false;
      tip.innerHTML = `<b>${it.grade.icon} ${it.grade.label}</b> · ${it.n}번째 결정<br>${actionText(it.mine.action, it.obs, state.ctx.seatName)}<br>추정 승률 ${pct(it.mine.value)}${it.loss > 0 ? ` · −${(it.loss * 100).toFixed(1)}%p` : ""}`;
      const r = fig.getBoundingClientRect();
      const px = (x(i) / W) * r.width;
      tip.style.left = `${Math.min(Math.max(px, 80), r.width - 80)}px`;
      tip.style.top = `${(y(it.mine.value) / H) * r.height - 8}px`;
    };
    g.addEventListener("mouseenter", show);
    g.addEventListener("focus", show);
    g.addEventListener("mouseleave", () => (tip.hidden = true));
    g.addEventListener("blur", () => (tip.hidden = true));
    g.addEventListener("click", () => renderDetail(state, i));
  });
  fig.appendChild(svg);
  fig.appendChild(tip);
  const legend = el("div", "chart-legend xsmall");
  const entries = [
    { color: BEST.color, text: "★✓ 최선·좋음" },
    { color: TABLE.color, text: "≡ 기준표대로" },
    ...GRADES.slice(0, 3).reverse().map((g) => ({ color: g.color, text: `${g.icon} ${g.label}` })),
  ];
  legend.innerHTML = entries.map((g) => `<span><i style="background:${g.color}"></i>${g.text}</span>`).join("")
    + '<span class="muted">선 = 내 수의 추정 승률 · 점을 누르면 그 장면으로</span>';
  fig.appendChild(legend);
}

function renderSummary(state) {
  const box = $("rv-summary");
  const items = state.items;
  const counts = Object.fromEntries([BEST, TABLE, ...GRADES].map((g) => [g.id, 0]));
  items.forEach((it) => counts[it.grade.id]++);
  const loss = items.reduce((s, it) => s + it.loss, 0);
  const accurate = items.filter((it) => it.loss === 0).length;
  box.innerHTML = "";
  const stat = (k, v, cls = "") => {
    const d = el("div", `stat ${cls}`);
    d.innerHTML = `<div class="stat-v">${v}</div><div class="stat-k">${k}</div>`;
    box.appendChild(d);
  };
  stat("결정", items.length);
  stat("정확도", items.length ? `${Math.round((accurate / items.length) * 100)}%` : "-");
  stat("확실한 손실 합", `${(loss * 100).toFixed(1)}%p`, loss > 0.1 ? "bad" : "");
  stat("블런더 · 실수 · 부정확", `${counts.blunder} · ${counts.mistake} · ${counts.inaccuracy}`);
  return { decisions: items.length, accurate, loss, counts };
}

function close() {
  $("review-view").hidden = true;
  document.body.classList.remove("no-scroll");
}

/**
 * 복기를 연다.
 * ctx: { replayJson, decisions, seat, players, seatName, outcome, finalEvents, onReplayFrom, onSummary }
 */
export function openReview(ctx) {
  const view = $("review-view");
  view.hidden = false;
  document.body.classList.add("no-scroll");
  $("rv-close").onclick = close;
  $("rv-list").innerHTML = "";
  $("rv-detail").innerHTML = "";
  $("rv-chart").innerHTML = "";
  $("rv-summary").innerHTML = "";
  const prog = $("rv-progress");
  prog.hidden = false;
  const bar = prog.querySelector(".bar-fill");
  const label = prog.querySelector(".bar-label");

  const decisions = ctx.decisions;
  if (decisions.length === 0) {
    prog.hidden = true;
    $("rv-detail").appendChild(el("p", "muted", "복기할 내 결정이 없다."));
    return;
  }
  // 행동 번호 → 그 행동 이후 첫 행동(다음 사람의 땡큐 여부 확인용)
  const actions = ctx.finalEvents.filter((e) => e.action !== undefined);
  const state = { ctx, items: [], selected: -1 };
  const raw = new Array(decisions.length);
  const jobId = ++jobCounter;
  const w = getWorker();
  label.textContent = `분석 중… 0 / ${decisions.length}`;
  bar.style.width = "0%";
  let done = 0;

  w.onmessage = (e) => {
    const msg = e.data;
    if (msg.jobId !== jobId) return;
    if (msg.type === "error") {
      label.textContent = `분석 실패: ${msg.message}`;
      return;
    }
    if (msg.type === "item") {
      raw[msg.i] = msg;
      done++;
      bar.style.width = `${(done / decisions.length) * 100}%`;
      label.textContent = `분석 중… ${done} / ${decisions.length}`;
      return;
    }
    // done
    prog.hidden = true;
    let n = 0;
    raw.forEach((r, i) => {
      if (!r || r.forced) return;
      const d = decisions[i];
      const mine = r.scored.find((v) => v.action === d.action);
      if (!mine) return;
      n++;
      const item = { n, decision: d, obs: r.obs, scored: r.scored, mine, best: r.scored[0] };
      item.loss = lossOf(item);
      item.grade = gradeOf(item);
      const legal = r.scored.map((v) => v.action);
      const tc = stopTableCheck(r.obs, mine.action, item.best.action, legal, ctx.seat);
      item.table = tc;
      if (tc && tc.followed && tc.aboutStop) {
        // 기준표대로 둔 스톱 판단은 실수로 세지 않고, 시뮬레이션 의견은 참고로만 보여 준다
        item.simGap = item.loss;
        item.loss = 0;
        item.grade = TABLE;
      }
      const after = actions[d.index + 1];
      const m = parseAction(d.action);
      const nextTook =
        m.verb === "discard" &&
        after &&
        after.seat === (ctx.seat + 1) % ctx.players &&
        after.action.startsWith("thankyou ") &&
        after.action.split(" ").includes(m.cards[0]);
      if (item.grade === TABLE) {
        const t = item.table;
        const rule = t.limit === null ? `상대 최소 ${t.fewest}장 → 스톱 금지` : `상대 최소 ${t.fewest}장 → ${t.limit}점 이하 스톱`;
        item.category = "stop";
        item.lines = [
          `스톱 기준표(${rule})대로 ${mine.action === "stop" ? "스톱했다" : "스톱하지 않았다"}. 실수로 세지 않는다.`,
          `참고: 시뮬레이션은 ${actionText(item.best.action, r.obs, ctx.seatName)} 쪽을 ${((item.best.value - mine.value) * 100).toFixed(0)}%p 높게 봤지만, 스톱 판단은 상대 손패 추정에 크게 좌우되는 장면이라 실측 기준표를 우선한다.`,
        ];
      } else {
        const ex = explain(item, { ...ctx, isLast: i === decisions.length - 1, nextTookMyDiscard: nextTook });
        item.category = ex.category;
        item.lines = ex.lines;
      }
      state.items.push(item);
    });
    const summary = renderSummary(state);
    renderChart(state);
    renderList(state);
    const firstErr = state.items.reduce((bi, it, i, arr) => (it.loss > (arr[bi]?.loss ?? 0) ? i : bi), 0);
    renderDetail(state, firstErr);
    const cats = {};
    state.items.filter((it) => it.loss > 0).forEach((it) => (cats[it.category] = (cats[it.category] || 0) + 1));
    ctx.onSummary?.({ ...summary, categories: cats });
  };
  w.postMessage({ jobId, replay: ctx.replayJson, decisions, k: REVIEW_K, seat: ctx.seat });
}

export { CATEGORY };
