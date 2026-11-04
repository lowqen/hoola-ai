//! L2 전문가 봇 (ROADMAP §2.3). 파라미터로 전략 가설을 바꿔 가며 실험한다 (P2).
//!
//! 판단 요소
//! - 스톱: 보이지 않는 카드에서 상대 손패를 균일 샘플링해 "내가 엄격 최저일 확률"을 추정
//! - 등록: 손패를 최대 점수 조합으로 분할. 즉시 등록 또는 보류(털기·스톱 가능해질 때만 등록)
//! - 버림: 카드 점수 − 아웃(완성 카드 수) 가치 − 다음 사람 땡큐 위험
//!
//! 사양 문자열: `expert` 또는 `expert:stop=c0.6:meld=hold:seven=0:ty=1:danger=1:outs=1.5:samples=32`

use crate::card::{Card, CardSet};
use crate::game::{Action, Phase, new_melds};
use crate::meld::AceMode;
use crate::observation::Observation;
use crate::rng::Rng;
use crate::rules::Rules;

/// 스톱 정책.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StopPolicy {
    /// 손패 점수가 이 값 이하이면 스톱.
    Threshold(u32),
    /// 추정 승리 확률이 이 값 이상이면 스톱.
    Confidence(f64),
    /// 사람용 규칙표: `limits[k]` = 가장 적게 든 상대가 k장일 때 스톱할 최대 점수 (`None`이면 스톱 안 함).
    /// 표보다 많은 장수는 마지막 값을 쓴다. 사양: `stop=r-,2,5,9,10` (1장부터).
    Table([Option<u32>; 8]),
    /// 스톱하지 않는다 (털기만 노림). 사양: `stop=never`.
    Never,
}

/// 등록 방식.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MeldMode {
    /// 조합이 생기면 즉시 등록. 사양 `meld=now`.
    Now,
    /// 털기나 스톱(손패 ≤ 스톱 한도)이 가능해질 때만 등록. 사양 `meld=hold`.
    Hold,
    /// 한 번에 털 수 있을 때만 등록 ("한 방"). 사양 `meld=allin`.
    AllIn,
    /// 몰아뒀다가 한꺼번에: 조합(2장 이상)이 2개 이상 모이거나, 등록·붙이기 후 손패가
    /// 2장 이하로 남을 수 있으면 그 차례에 전부 등록하고 붙인다 (7 단독 포함).
    /// 그 전에는 등록·붙이기를 하지 않는다 (땡큐는 설정대로). 사양 `meld=dump`.
    Dump,
}

/// 전문가 봇 설정.
#[derive(Debug, Clone, PartialEq)]
pub struct ExpertConfig {
    pub stop: StopPolicy,
    pub meld: MeldMode,
    /// 7 단독 등록 허용 (털기 직전에는 항상 허용).
    pub single_seven: bool,
    /// 땡큐 사용.
    pub thank_you: bool,
    /// 다음 사람 땡큐 위험 가중치 (위험 확률 × 10점 × 가중치).
    pub danger_weight: f64,
    /// 아웃 1장당 보존 가치 (점).
    pub outs_weight: f64,
    /// 믿음 샘플 수.
    pub samples: usize,
}

impl Default for ExpertConfig {
    fn default() -> Self {
        // P2 1차 실험(hoola-lab H1·H5·H6)으로 조정한 값
        ExpertConfig {
            stop: StopPolicy::Confidence(0.9),
            meld: MeldMode::Now,
            single_seven: true,
            thank_you: true,
            danger_weight: 0.0,
            outs_weight: 3.0,
            samples: 32,
        }
    }
}

impl ExpertConfig {
    /// `stop=c0.6:meld=hold` 같은 `key=value` 목록(`:` 구분)을 기본값 위에 적용한다.
    pub fn parse(spec: &str) -> Result<ExpertConfig, String> {
        let mut cfg = ExpertConfig::default();
        for item in spec.split(':').filter(|s| !s.is_empty()) {
            let (key, value) = item
                .split_once('=')
                .ok_or_else(|| format!("expected key=value, got {item:?}"))?;
            let bad = || format!("bad value for {key}: {value:?}");
            let flag = |v: &str| match v {
                "1" | "true" | "on" => Ok(true),
                "0" | "false" | "off" => Ok(false),
                _ => Err(bad()),
            };
            match key {
                "stop" => {
                    cfg.stop = if value == "never" {
                        StopPolicy::Never
                    } else if let Some(list) = value.strip_prefix('r') {
                        let mut limits = [None; 8];
                        let items: Vec<&str> = list.split(',').collect();
                        if items.is_empty() || items.len() > 7 {
                            return Err(bad());
                        }
                        let mut last = None;
                        for (k, slot) in limits.iter_mut().enumerate().skip(1) {
                            if let Some(item) = items.get(k - 1) {
                                last = match *item {
                                    "-" => None,
                                    n => Some(n.parse().map_err(|_| bad())?),
                                };
                            }
                            *slot = last;
                        }
                        StopPolicy::Table(limits)
                    } else if let Some(t) = value.strip_prefix('t') {
                        StopPolicy::Threshold(t.parse().map_err(|_| bad())?)
                    } else if let Some(c) = value.strip_prefix('c') {
                        StopPolicy::Confidence(c.parse().map_err(|_| bad())?)
                    } else {
                        return Err(bad());
                    }
                }
                "meld" => {
                    cfg.meld = match value {
                        "now" => MeldMode::Now,
                        "hold" => MeldMode::Hold,
                        "allin" => MeldMode::AllIn,
                        "dump" => MeldMode::Dump,
                        _ => return Err(bad()),
                    }
                }
                "seven" => cfg.single_seven = flag(value)?,
                "ty" => cfg.thank_you = flag(value)?,
                "danger" => cfg.danger_weight = value.parse().map_err(|_| bad())?,
                "outs" => cfg.outs_weight = value.parse().map_err(|_| bad())?,
                "samples" => {
                    cfg.samples = value.parse().map_err(|_| bad())?;
                    if cfg.samples == 0 {
                        return Err(bad());
                    }
                }
                _ => return Err(format!("unknown expert option {key:?}")),
            }
        }
        Ok(cfg)
    }
}

/// L2 전문가 봇.
#[derive(Debug, Clone)]
pub struct ExpertBot {
    pub cfg: ExpertConfig,
    rng: Rng,
    /// `MeldMode::Dump`: 이번 차례에 한꺼번에 내려놓기로 했는지 (차례 시작에 초기화).
    dumping: bool,
}

impl ExpertBot {
    pub fn new(cfg: ExpertConfig, seed: u64) -> ExpertBot {
        ExpertBot {
            cfg,
            rng: Rng::seed_from_u64(seed),
            dumping: false,
        }
    }

    /// 지금 스톱했을 때 이길 확률 추정 (상대 손패 균일 샘플링).
    pub fn stop_win_probability(&mut self, obs: &Observation<'_>) -> f64 {
        let mine = obs.hand_points();
        let mut pool: Vec<Card> = obs.unseen().iter().collect();
        let mut wins = 0usize;
        for _ in 0..self.cfg.samples {
            let mut offset = 0;
            let mut win = true;
            for s in 0..obs.num_players {
                if s == obs.seat {
                    continue;
                }
                let k = obs.hand_counts[s];
                let hand = draw_sample(&mut self.rng, &mut pool, offset, k);
                offset += k;
                if hand.points(&obs.rules.points) <= mine {
                    win = false;
                    break;
                }
            }
            if win {
                wins += 1;
            }
        }
        wins as f64 / self.cfg.samples as f64
    }

    fn wants_stop(&mut self, obs: &Observation<'_>) -> bool {
        match self.cfg.stop {
            StopPolicy::Never => false,
            StopPolicy::Threshold(t) => obs.hand_points() <= t,
            StopPolicy::Confidence(c) => self.stop_win_probability(obs) >= c,
            StopPolicy::Table(limits) => {
                let fewest = (0..obs.num_players)
                    .filter(|&s| s != obs.seat)
                    .map(|s| obs.hand_counts[s])
                    .min()
                    .unwrap_or(7)
                    .min(7);
                limits[fewest].is_some_and(|t| obs.hand_points() <= t)
            }
        }
    }

    /// 다음 사람이 `card`를 땡큐할 수 있을 확률 추정.
    fn danger(&mut self, obs: &Observation<'_>, card: Card, unseen: &[Card]) -> f64 {
        let next = (obs.seat + 1) % obs.num_players;
        let k = obs.hand_counts[next];
        if k < obs.rules.thank_you.min_hand_cards {
            return 0.0;
        }
        let mut pool = unseen.to_vec();
        let samples = self.cfg.samples.min(16);
        let mut hits = 0usize;
        for _ in 0..samples {
            let hand = draw_sample(&mut self.rng, &mut pool, 0, k);
            if can_thank_you(hand, card, obs.rules) {
                hits += 1;
            }
        }
        hits as f64 / samples as f64
    }
}

/// `pool[offset..]`에서 `k`장을 무작위로 골라 `pool[offset..offset + k]`로 옮기고 집합으로 돌려준다.
fn draw_sample(rng: &mut Rng, pool: &mut [Card], offset: usize, k: usize) -> CardSet {
    let mut set = CardSet::EMPTY;
    for i in offset..offset + k {
        let j = i + rng.below((pool.len() - i) as u64) as usize;
        pool.swap(i, j);
        set.insert(pool[i]);
    }
    set
}

/// `hand`(땡큐하는 사람의 손패)로 `card`를 땡큐할 수 있는지 (규칙의 A 처리 그대로).
fn can_thank_you(hand: CardSet, card: Card, rules: &Rules) -> bool {
    let need = rules.thank_you.min_hand_cards;
    let mut pool = hand;
    pool.insert(card);
    new_melds(pool, rules)
        .into_iter()
        .any(|m| m.contains(card) && m.len() > need.max(1))
}

/// 런 기준으로 `raw` 위치의 랭크 (A 처리 반영). `HighLow`에서 14는 A.
fn rank_at(raw: i32, mode: AceMode) -> Option<u8> {
    match mode {
        AceMode::Low => (1..=13).contains(&raw).then_some(raw as u8),
        AceMode::HighLow => match raw {
            1..=13 => Some(raw as u8),
            14 => Some(1),
            _ => None,
        },
        AceMode::Wrap => Some(((raw - 1).rem_euclid(13) + 1) as u8),
    }
}

/// `card`와 손패의 다른 카드 1장으로 2장 조각을 이룰 때, 그 조각을 완성하는 보이지 않는 카드 수.
fn outs(hand: CardSet, card: Card, unseen: CardSet, mode: AceMode) -> usize {
    let mut completing = CardSet::EMPTY;
    let others = {
        let mut h = hand;
        h.remove(card);
        h
    };
    if others.iter().any(|c| c.rank() == card.rank()) {
        for c in unseen.iter().filter(|c| c.rank() == card.rank()) {
            completing.insert(c);
        }
    }
    let suit = card.suit();
    // A는 양 끝 모드에서 1과 14 두 자리로 본다
    let reps: &[i32] = if card.rank() == 1 && mode == AceMode::HighLow {
        &[1, 14]
    } else if card.rank() == 1 {
        &[1]
    } else {
        &[card.rank() as i32]
    };
    for &r in reps {
        let at = |raw: i32| rank_at(raw, mode).map(|x| Card::new(suit, x));
        let has = |raw: i32| at(raw).is_some_and(|c| c != card && others.contains(c));
        let mut add = |raw: i32| {
            if let Some(c) = at(raw)
                && c != card
                && unseen.contains(c)
            {
                completing.insert(c);
            }
        };
        if has(r + 1) {
            add(r - 1);
            add(r + 2);
        }
        if has(r - 1) {
            add(r + 1);
            add(r - 2);
        }
        if has(r + 2) {
            add(r + 1);
        }
        if has(r - 2) {
            add(r - 1);
        }
    }
    completing.len()
}

/// 서로 겹치지 않는 조합 묶음 중 점수 합이 가장 큰 것.
fn best_partition(hand: CardSet, rules: &Rules, allow_seven: bool) -> Vec<CardSet> {
    let melds: Vec<CardSet> = new_melds(hand, rules)
        .into_iter()
        .filter(|m| allow_seven || m.len() > 1)
        .collect();
    let mut best = (0u32, Vec::new());
    let mut cur = Vec::new();
    search(&melds, 0, CardSet::EMPTY, 0, rules, &mut cur, &mut best);
    best.1
}

fn search(
    melds: &[CardSet],
    start: usize,
    used: CardSet,
    score: u32,
    rules: &Rules,
    cur: &mut Vec<CardSet>,
    best: &mut (u32, Vec<CardSet>),
) {
    if score > best.0 {
        *best = (score, cur.clone());
    }
    for i in start..melds.len() {
        let m = melds[i];
        if !m.intersection(used).is_empty() {
            continue;
        }
        cur.push(m);
        search(
            melds,
            i + 1,
            used.union(m),
            score + m.points(&rules.points),
            rules,
            cur,
            best,
        );
        cur.pop();
    }
}

impl crate::bot::Bot for ExpertBot {
    fn name(&self) -> &str {
        "L2-expert"
    }

    fn act(&mut self, obs: &Observation<'_>, legal: &[Action]) -> Action {
        let rules = obs.rules;
        let pts = |c: Card| rules.points.points(c);
        match obs.phase {
            Phase::TurnStart => {
                self.dumping = false;
                if legal.contains(&Action::Stop) && self.wants_stop(obs) {
                    return Action::Stop;
                }
                if self.cfg.thank_you {
                    let best = legal
                        .iter()
                        .filter_map(|&a| match a {
                            Action::ThankYou { meld } => {
                                Some((meld.intersection(obs.hand).points(&rules.points), a))
                            }
                            _ => None,
                        })
                        .max_by_key(|&(g, _)| g);
                    if let Some((_, a)) = best {
                        return a;
                    }
                }
                Action::Draw
            }
            Phase::MeldPhase => {
                let hand = obs.hand;
                let full = best_partition(hand, rules, true);
                let full_cards = full.iter().fold(CardSet::EMPTY, |a, &m| a.union(m));
                let going_out = full_cards.len() + 1 >= hand.len();
                let dump = self.cfg.meld == MeldMode::Dump;
                let plan = if going_out || dump {
                    full
                } else {
                    best_partition(hand, rules, self.cfg.single_seven)
                };
                let plan_cards = plan.iter().fold(CardSet::EMPTY, |a, &m| a.union(m));
                let after = hand.difference(plan_cards).points(&rules.points);
                if dump && !self.dumping {
                    let multi = plan.iter().filter(|m| m.len() > 1).count();
                    let attachable: CardSet = legal
                        .iter()
                        .filter_map(|a| match *a {
                            Action::Attach { card, .. } if !plan_cards.contains(card) => Some(card),
                            _ => None,
                        })
                        .collect();
                    let left = hand.len() - plan_cards.len() - attachable.len();
                    let has_any = !plan.is_empty() || !attachable.is_empty();
                    self.dumping = going_out || multi >= 2 || (has_any && left <= 2);
                }
                let register_now = going_out
                    || match self.cfg.meld {
                        MeldMode::Now => true,
                        MeldMode::Hold => after <= rules.stop.limit,
                        MeldMode::AllIn => false,
                        MeldMode::Dump => self.dumping,
                    };
                if register_now
                    && let Some(&m) = plan.iter().max_by_key(|m| m.points(&rules.points))
                {
                    return Action::Register { cards: m };
                }
                // 붙이기: 보류 중인 조합의 카드는 건드리지 않는다. 몰아두기 모드는 내려놓는 차례에만
                let may_attach = !dump || self.dumping;
                let attach = legal
                    .iter()
                    .filter(|_| may_attach)
                    .filter_map(|&a| match a {
                        Action::Attach { card, .. } if !plan_cards.contains(card) => {
                            Some((pts(card), a))
                        }
                        _ => None,
                    })
                    .max_by_key(|&(p, _)| p);
                if let Some((_, a)) = attach {
                    return a;
                }
                // 버리기
                let unseen = obs.unseen();
                let unseen_vec: Vec<Card> = unseen.iter().collect();
                let candidates = if plan_cards.len() < hand.len() {
                    hand.difference(plan_cards)
                } else {
                    hand
                };
                let mut best: Option<(f64, Card)> = None;
                for card in candidates {
                    let mut score = f64::from(pts(card))
                        - self.cfg.outs_weight * outs(hand, card, unseen, rules.meld.ace_mode) as f64;
                    if self.cfg.danger_weight > 0.0 {
                        score -=
                            self.cfg.danger_weight * 10.0 * self.danger(obs, card, &unseen_vec);
                    }
                    if best.is_none_or(|(s, c)| score > s || (score == s && card > c)) {
                        best = Some((score, card));
                    }
                }
                let card = best.expect("non-empty hand").1;
                Action::Discard { card }
            }
            Phase::Over => legal[0],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::parse_cards;

    fn cs(s: &str) -> CardSet {
        parse_cards(s).unwrap().into_iter().collect()
    }

    fn c(s: &str) -> Card {
        s.parse().unwrap()
    }

    #[test]
    fn parse_spec() {
        let cfg =
            ExpertConfig::parse("stop=t5:meld=hold:seven=0:ty=off:danger=0:samples=8").unwrap();
        assert_eq!(cfg.stop, StopPolicy::Threshold(5));
        assert_eq!(cfg.meld, MeldMode::Hold);
        assert!(!cfg.single_seven && !cfg.thank_you);
        let friend = ExpertConfig::parse("stop=never:meld=allin").unwrap();
        assert_eq!(friend.stop, StopPolicy::Never);
        assert_eq!(friend.meld, MeldMode::AllIn);
        assert_eq!(ExpertConfig::parse("meld=dump").unwrap().meld, MeldMode::Dump);
        assert_eq!(cfg.danger_weight, 0.0);
        assert_eq!(cfg.samples, 8);
        assert_eq!(ExpertConfig::parse("").unwrap(), ExpertConfig::default());
        let table = ExpertConfig::parse("stop=r-,2,5,9,10").unwrap();
        assert_eq!(
            table.stop,
            StopPolicy::Table([
                None,
                None,
                Some(2),
                Some(5),
                Some(9),
                Some(10),
                Some(10),
                Some(10)
            ])
        );
        for bad in [
            "stop=x1",
            "stop=r",
            "stop=rx",
            "meld=later",
            "bogus=1",
            "samples=0",
            "nokey",
        ] {
            assert!(ExpertConfig::parse(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn thank_you_check() {
        let r = Rules::default();
        assert!(can_thank_you(cs("5S 5H 9C"), c("5D"), &r));
        assert!(!can_thank_you(cs("5S 9C"), c("5D"), &r));
        assert!(can_thank_you(cs("4H 6H"), c("5H"), &r));
        assert!(can_thank_you(cs("6H 7H"), c("5H"), &r));
        assert!(!can_thank_you(cs("6H 8H"), c("5H"), &r));
        // 순환 규칙(기본): Q-K-A, K-A-2 땡큐 가능 / A는 1로만이면 불가
        assert!(can_thank_you(cs("QH KH"), c("AH"), &r));
        assert!(can_thank_you(cs("KH 2H"), c("AH"), &r));
        let low = Rules {
            meld: crate::meld::MeldRules {
                ace_mode: AceMode::Low,
                ..crate::meld::MeldRules::default()
            },
            ..Rules::default()
        };
        assert!(!can_thank_you(cs("QH KH"), c("AH"), &low));
    }

    #[test]
    fn outs_count() {
        let unseen = CardSet::FULL.difference(cs("5S 5H 9C 6D 7D"));
        // 5 페어: 남은 5D 5C
        let low = AceMode::Low;
        assert_eq!(outs(cs("5S 5H 9C"), c("5S"), unseen, low), 2);
        assert_eq!(outs(cs("5S 5H 9C"), c("9C"), unseen, low), 0);
        // 6D-7D: 5D, 8D
        assert_eq!(outs(cs("6D 7D KS"), c("6D"), unseen, low), 2);
        // K-A 조각: 순환이면 Q, 2 / 양 끝이면 Q만 / 1로만이면 조각 아님
        let u = CardSet::FULL.difference(cs("KH AH 9C"));
        assert_eq!(outs(cs("KH AH 9C"), c("KH"), u, AceMode::Wrap), 2);
        assert_eq!(outs(cs("KH AH 9C"), c("AH"), u, AceMode::HighLow), 1);
        assert_eq!(outs(cs("KH AH 9C"), c("KH"), u, AceMode::Low), 0);
    }

    #[test]
    fn dump_mode_holds_one_meld_and_dumps_at_two() {
        use crate::bot::Bot;
        use crate::game::Game;
        let cfg = ExpertConfig::parse("meld=dump:stop=never").unwrap();
        let hands = |a: &str| [cs(a), cs("KC QC JD")];
        // 조합 1개(5 세트)뿐이고 남는 카드가 많다 → 등록하지 않고 버린다
        let mut g = Game::with_hands(Rules::default(), &hands("5S 5H 5D 9C KD 2H"), Some(c("JS")), &[c("TH")], 0, 1);
        g.apply(Action::Draw).unwrap();
        let mut bot = ExpertBot::new(cfg.clone(), 1);
        let a = bot.act(&g.observation(0), &g.legal_actions());
        assert!(matches!(a, Action::Discard { .. }), "{a}");
        // 조합 2개(5 세트 + 8-9-T 런) → 그 차례에 등록
        let mut g = Game::with_hands(Rules::default(), &hands("5S 5H 5D 8H 9H KD 2C"), Some(c("JS")), &[c("TH")], 0, 1);
        g.apply(Action::Draw).unwrap();
        let mut bot = ExpertBot::new(cfg, 1);
        let a = bot.act(&g.observation(0), &g.legal_actions());
        assert!(matches!(a, Action::Register { .. }), "{a}");
    }

    #[test]
    fn partition_maximizes_points() {
        let r = Rules::default();
        let p = best_partition(cs("5S 5H 5D 6S 7S 8S KC"), &r, true);
        let covered = p.iter().fold(CardSet::EMPTY, |a, &m| a.union(m));
        // 5S5H5D(15) + 6S7S8S(21) = 36 > 5S6S7S8S(26) + ...
        assert_eq!(covered, cs("5S 5H 5D 6S 7S 8S"));
        let no_seven = best_partition(cs("7S KC"), &r, false);
        assert!(no_seven.is_empty());
    }
}
