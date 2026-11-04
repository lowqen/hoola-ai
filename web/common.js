// 화면과 복기가 함께 쓰는 카드·행동 도우미.

export const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RANK_ORDER = "A23456789TJQK";
/** 전략서 v1 스톱 기준표: 가장 적게 든 상대의 장수 → 스톱할 최대 점수 (null = 스톱 안 함). */
export const STOP_TABLE = [null, null, 4, 8, 10, 10, 10, 10];

export const rankOf = (c) => c.slice(0, -1);
export const suitOf = (c) => c.slice(-1);
export const rankNum = (c) => RANK_ORDER.indexOf(rankOf(c)) + 1;
export const points = (c) => rankNum(c);
export const isRed = (c) => suitOf(c) === "H" || suitOf(c) === "D";
export const rankLabel = (r) => (r === "T" ? "10" : r);
export const cardText = (c) => rankLabel(rankOf(c)) + SUIT[suitOf(c)];
export const cardsText = (list) => list.map(cardText).join(" ");

export function sortCards(cs) {
  return [...cs].sort((a, b) => {
    const s = "SHDC".indexOf(suitOf(a)) - "SHDC".indexOf(suitOf(b));
    return s !== 0 ? s : rankNum(a) - rankNum(b);
  });
}

/** 카드 요소. size: "lg" | "md" | "sm" | "xs". */
export function cardEl(c, { button = false, size = "md", mark = "" } = {}) {
  const el = document.createElement(button ? "button" : "span");
  el.className = `card ${size}${isRed(c) ? " red" : ""}${mark ? ` mark-${mark}` : ""}`;
  const r = rankLabel(rankOf(c));
  const s = SUIT[suitOf(c)];
  el.innerHTML = `<span class="corner"><span class="r">${r}</span><span class="s">${s}</span></span><span class="pip">${s}</span>`;
  el.title = cardText(c);
  el.setAttribute("aria-label", cardText(c));
  return el;
}

export function cardBack(size = "xs") {
  const el = document.createElement("span");
  el.className = `card back ${size}`;
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** "discard KD" → { verb: "discard", cards: ["KD"], meld: undefined } */
export function parseAction(a) {
  const [verb, ...rest] = a.split(" ");
  if (verb === "attach") return { verb, cards: [rest[0]], meld: +rest[1] };
  if (verb === "thankyou-attach") return { verb, cards: [], meld: +rest[0] };
  return { verb, cards: rest };
}

export function meldLabel(obs, idx, seatName) {
  const m = obs.melds[idx];
  if (!m) return `#${idx}`;
  const kind = { set: "세트", run: "런", seven: "7" }[m.kind];
  return `${seatName(m.owner)}의 ${kind} [${cardsText(sortCards(m.cards))}]`;
}

export function actionText(a, obs, seatName) {
  const { verb, cards, meld } = parseAction(a);
  switch (verb) {
    case "stop": return "스톱";
    case "draw": return "받기";
    case "thankyou": return `땡큐 ${cardsText(sortCards(cards))}`;
    case "thankyou-attach": return `땡큐 붙이기 → ${meldLabel(obs, meld, seatName)}`;
    case "register": return `등록 ${cardsText(sortCards(cards))}`;
    case "attach": return `붙이기 ${cardText(cards[0])} → ${meldLabel(obs, meld, seatName)}`;
    case "discard": return `버림 ${cardText(cards[0])}`;
    default: return a;
  }
}

export function el(tag, cls = "", text = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// ---------- 조각(조합 직전 카드) 분석: 복기·훈련 공용 ----------

/** 관측 좌석이 위치를 모르는 카드 (손패·바닥·버림패 기억 제외). */
export function unseenOf(obs) {
  const seen = new Set([...obs.hand, ...obs.known_discards, ...obs.melds.flatMap((m) => m.cards)]);
  const all = [];
  for (const s of "SHDC") for (const r of RANK_ORDER) all.push(r + s);
  return new Set(all.filter((c) => !seen.has(c)));
}

// 순환 런 규칙(RULES v1.2): K 다음은 A, A 다음은 2
export const wrapRank = (x) => ((((x - 1) % 13) + 13) % 13) + 1;
export const cardOf = (rank, suit) => RANK_ORDER[wrapRank(rank) - 1] + suit;

/** card가 손패의 다른 카드와 2장 조각을 이루면 {kind, partner, outs[]} (아웃이 가장 많은 것). */
export function fragmentOf(card, hand, unseen) {
  const others = hand.filter((c) => c !== card);
  const r = rankNum(card);
  const s = suitOf(card);
  const cands = [];
  const same = others.filter((c) => rankNum(c) === r);
  if (same.length) {
    cands.push({ kind: "페어를", partner: same[0], outs: [...unseen].filter((c) => rankNum(c) === r) });
  }
  for (const d of [1, -1, 2, -2]) {
    const partner = others.find((c) => suitOf(c) === s && rankNum(c) === wrapRank(r + d));
    if (!partner) continue;
    const lo = Math.min(r, r + d);
    const hi = Math.max(r, r + d);
    const need = Math.abs(d) === 1 ? [lo - 1, hi + 1] : [lo + 1];
    const outs = need.map((x) => cardOf(x, s)).filter((c) => c !== card && unseen.has(c));
    cands.push({ kind: Math.abs(d) === 1 ? "연속을" : "한 칸 건너뛴 연속을", partner, outs });
  }
  cands.sort((a, b) => b.outs.length - a.outs.length);
  return cands.length && cands[0].outs.length > 0 ? cands[0] : null;
}

/** 버림 규칙 점수: 카드 점수 − 살려 줄 카드 수 × w (높을수록 먼저 버린다). */
export function discardScore(card, hand, unseen, w = 3) {
  const f = fragmentOf(card, hand, unseen);
  return points(card) - (f ? f.outs.length : 0) * w;
}
