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
