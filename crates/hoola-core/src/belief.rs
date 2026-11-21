//! 상대 손패 추정 (결정화 샘플링).
//!
//! 균일 샘플링은 "상대가 높은 카드부터 버려 낮은 카드가 남는다"는 사실을 무시해 상대 점수를
//! 과대평가한다 (예: 1장 남은 상대의 카드를 무작위 카드로 본다). 학습된 가중치
//! [`LEARNED`]는 봇 대전 기록에서 "상대가 k장 들고 있을 때, 보이지 않는 카드 중 랭크 r이
//! 그 상대 손에 있을 상대 확률"을 측정한 표다 (`hoola-lab --only BELIEF`).
//!
//! [`Belief::Bayes`]는 그 위에 공개 행동을 증거로 더한다 ([`Evidence`]). 표로 손패 후보를 여럿
//! 뽑고, 증거와 어긋나는 정도로 가중치를 줘 하나를 고른다 (표본 중요도 재추출, SIR).

use crate::card::{Card, CardSet};
use crate::game::{Action, Event, new_melds};
use crate::observation::Observation;
use crate::rng::Rng;
use crate::rules::Rules;

/// `[손패 장수 k (0..=7, 7은 7장 이상)][랭크 - 1]` → 상대 가중치.
pub type RankWeights = [[f64; 13]; 8];

/// 균일 (가중치 없음).
pub const UNIFORM: RankWeights = [[1.0; 13]; 8];

/// 학습된 가중치. `hoola-lab --only BELIEF`가 출력한 표 (전문가 봇·친구 페르소나 혼합 대전,
/// RULES v1.1, 2026-11-03). 보정 검증: 스톱 승률 추정의 Brier 점수 균일 0.153 → 학습 0.080,
/// 상대가 1장일 때 평균 추정 균일 0.52 / 학습 0.18 / 실제 0.16.
/// 7이 거의 0인 행은 7을 단독 등록하는 습관 때문이다.
#[rustfmt::skip]
pub const LEARNED: RankWeights = [
    [1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000],
    [4.022, 3.121, 2.331, 1.482, 0.888, 0.373, 0.020, 0.224, 0.230, 0.163, 0.090, 0.050, 0.024],
    [2.453, 2.481, 2.263, 1.868, 1.284, 0.693, 0.288, 0.420, 0.504, 0.376, 0.213, 0.105, 0.052],
    [2.066, 2.038, 1.948, 1.783, 1.484, 0.899, 0.359, 0.615, 0.678, 0.515, 0.330, 0.187, 0.097],
    [1.781, 1.797, 1.756, 1.667, 1.482, 1.062, 0.378, 0.783, 0.787, 0.628, 0.448, 0.279, 0.151],
    [1.766, 1.729, 1.694, 1.661, 1.442, 0.872, 0.020, 0.706, 0.939, 0.844, 0.655, 0.446, 0.246],
    [1.525, 1.533, 1.494, 1.450, 1.425, 0.990, 0.020, 0.868, 1.085, 0.951, 0.785, 0.574, 0.320],
    [1.261, 1.252, 1.233, 1.213, 1.205, 1.178, 0.880, 1.065, 0.945, 0.855, 0.763, 0.636, 0.513],
];

/// 추정 방식.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Belief {
    Uniform,
    Learned,
    /// 학습된 표 + 공개 행동 증거 ([`sample_hidden_bayes`]).
    Bayes,
}

impl Belief {
    pub fn table(self) -> &'static RankWeights {
        match self {
            Belief::Uniform => &UNIFORM,
            Belief::Learned | Belief::Bayes => &LEARNED,
        }
    }
}

/// 베이즈 추론 강도. 증거 하나와 어긋나는 손패에 곱하는 가능도다 (1이면 그 증거를 무시).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BayesParams {
    /// 땡큐할 수 있었는데 받기를 골랐다: 그 카드와 조합되는 두 장을 든 손.
    pub pass: f64,
    /// 차례를 마쳤는데 손에 완성된 조합이 남아 있다 (바로 등록하는 습관).
    pub meld: f64,
    /// 최근 버린 카드와 같은 숫자이거나 같은 무늬로 이웃한 카드 한 장마다.
    pub discard: f64,
    /// 재추출할 손패 후보 수.
    pub candidates: usize,
    /// 좌석마다 보는 최근 땡큐 넘김·버림 수.
    pub recent: usize,
}

impl Default for BayesParams {
    fn default() -> Self {
        BayesParams {
            pass: 0.1,
            meld: 0.3,
            discard: 0.7,
            candidates: 16,
            recent: 3,
        }
    }
}

/// 관측에서 뽑은 좌석별 증거.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Evidence {
    /// 땡큐할 수 있었는데 넘긴 카드 (최근 것만).
    pub passes: Vec<Vec<Card>>,
    /// 버린 카드 (최근 것만).
    pub discards: Vec<Vec<Card>>,
    /// 차례를 한 번 이상 마쳤는가 (버리기로 끝낸 차례).
    pub played: Vec<bool>,
}

impl Evidence {
    pub fn from_obs(obs: &Observation<'_>, recent: usize) -> Evidence {
        let n = obs.num_players;
        let mut ev = Evidence {
            passes: vec![Vec::new(); n],
            discards: vec![Vec::new(); n],
            played: vec![false; n],
        };
        // 바로 앞 행동이 버리기였으면 (좌석, 카드)
        let mut last: Option<(usize, Card)> = None;
        for e in obs.events {
            let Event::Action { seat, action } = *e else {
                continue;
            };
            match action {
                Action::Draw => {
                    if let Some((who, card)) = last
                        && (who + 1) % n == seat
                    {
                        ev.passes[seat].push(card);
                    }
                }
                Action::Discard { card } => {
                    ev.discards[seat].push(card);
                    ev.played[seat] = true;
                }
                _ => {}
            }
            last = match action {
                Action::Discard { card } => Some((seat, card)),
                _ => None,
            };
        }
        for v in ev.passes.iter_mut().chain(ev.discards.iter_mut()) {
            let cut = v.len().saturating_sub(recent);
            v.drain(..cut);
        }
        ev
    }

    /// 좌석 `seat`이 `hand`를 들고 있을 로그 가능도 (상수 제외).
    pub fn log_weight(&self, seat: usize, hand: CardSet, rules: &Rules, p: &BayesParams) -> f64 {
        let mut lw = 0.0;
        if p.pass < 1.0 {
            for &t in &self.passes[seat] {
                let mut pool = hand;
                pool.insert(t);
                if new_melds(pool, rules)
                    .iter()
                    .any(|m| m.contains(t) && m.len() >= 3)
                {
                    lw += p.pass.ln();
                }
            }
        }
        if p.meld < 1.0 && self.played[seat] && !new_melds(hand, rules).is_empty() {
            lw += p.meld.ln();
        }
        if p.discard < 1.0 {
            for &d in &self.discards[seat] {
                let related = hand
                    .iter()
                    .filter(|c| {
                        c.rank() == d.rank()
                            || (c.suit() == d.suit() && c.rank().abs_diff(d.rank()) == 1)
                    })
                    .count();
                lw += related as f64 * p.discard.ln();
            }
        }
        lw
    }
}

/// [0, 1) 균일 난수.
fn unit(rng: &mut Rng) -> f64 {
    (rng.next_u64() >> 11) as f64 / (1u64 << 53) as f64
}

/// [`sample_hidden`]으로 후보를 여럿 뽑고 증거 가능도에 비례해 하나를 고른다.
pub fn sample_hidden_bayes(
    obs: &Observation<'_>,
    rng: &mut Rng,
    table: &RankWeights,
    ev: &Evidence,
    p: &BayesParams,
) -> (Vec<CardSet>, Vec<Card>) {
    let mut cands = Vec::with_capacity(p.candidates.max(1));
    let mut weights = Vec::with_capacity(p.candidates.max(1));
    for _ in 0..p.candidates.max(1) {
        let world = sample_hidden(obs, rng, table);
        let lw: f64 = (0..obs.num_players)
            .filter(|&s| s != obs.seat)
            .map(|s| ev.log_weight(s, world.0[s], obs.rules, p))
            .sum();
        cands.push(world);
        weights.push(lw.exp());
    }
    let total: f64 = weights.iter().sum();
    let mut x = unit(rng) * total;
    let mut pick = cands.len() - 1;
    for (i, w) in weights.iter().enumerate() {
        x -= w;
        if x < 0.0 {
            pick = i;
            break;
        }
    }
    cands.swap_remove(pick)
}

fn weight(table: &RankWeights, k: usize, card: Card) -> f64 {
    table[k.min(7)][(card.rank() - 1) as usize].max(1e-6)
}

/// `pool`에서 `k`장을 가중치에 비례해 비복원으로 뽑아 `pool`에서 뺀다.
/// `k_for_weights`는 가중치 표의 행(그 상대가 든 장수).
pub fn draw_weighted(
    rng: &mut Rng,
    pool: &mut Vec<Card>,
    k: usize,
    k_for_weights: usize,
    table: &RankWeights,
) -> CardSet {
    let mut hand = CardSet::EMPTY;
    for _ in 0..k.min(pool.len()) {
        let total: f64 = pool.iter().map(|&c| weight(table, k_for_weights, c)).sum();
        // [0, total) 균일 난수
        let mut x = unit(rng) * total;
        let mut pick = pool.len() - 1;
        for (i, &c) in pool.iter().enumerate() {
            x -= weight(table, k_for_weights, c);
            if x < 0.0 {
                pick = i;
                break;
            }
        }
        hand.insert(pool.swap_remove(pick));
    }
    hand
}

/// 관측과 맞는 숨은 정보 하나: (좌석별 손패, 더미 순서). 관측 좌석의 손패는 그대로.
pub fn sample_hidden(
    obs: &Observation<'_>,
    rng: &mut Rng,
    table: &RankWeights,
) -> (Vec<CardSet>, Vec<Card>) {
    let mut pool: Vec<Card> = obs.unseen().iter().collect();
    let mut hands = vec![CardSet::EMPTY; obs.num_players];
    // 좌석 순서로 뽑으면 앞 좌석이 유리해지지 않도록 장수가 적은 상대부터 (가중치 영향이 큼)
    let mut order: Vec<usize> = (0..obs.num_players).filter(|&s| s != obs.seat).collect();
    order.sort_by_key(|&s| obs.hand_counts[s]);
    for s in order {
        let k = obs.hand_counts[s];
        hands[s] = draw_weighted(rng, &mut pool, k, k, table);
    }
    hands[obs.seat] = obs.hand;
    rng.shuffle(&mut pool);
    (hands, pool)
}

/// 지금 스톱하면 이길 확률 추정 (내 점수가 모든 상대보다 엄격히 낮은 샘플 비율).
pub fn stop_win_estimate(
    obs: &Observation<'_>,
    rng: &mut Rng,
    table: &RankWeights,
    samples: usize,
) -> f64 {
    let mine = obs.hand_points();
    let mut wins = 0usize;
    for _ in 0..samples {
        let (hands, _) = sample_hidden(obs, rng, table);
        let win = (0..obs.num_players)
            .all(|s| s == obs.seat || hands[s].points(&obs.rules.points) > mine);
        wins += usize::from(win);
    }
    wins as f64 / samples.max(1) as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{Action, Game};
    use crate::rules::Rules;

    #[test]
    fn samples_match_counts_and_conserve_cards() {
        let mut g = Game::new(Rules::default(), 3, 5, 0).unwrap();
        g.apply(Action::Draw).unwrap();
        let obs = g.observation(0);
        let mut rng = Rng::seed_from_u64(1);
        for table in [&UNIFORM, &LEARNED] {
            let (hands, stock) = sample_hidden(&obs, &mut rng, table);
            assert_eq!(hands[0], obs.hand);
            for (s, h) in hands.iter().enumerate().skip(1) {
                assert_eq!(h.len(), obs.hand_counts[s]);
                assert!(h.is_subset(obs.unseen()));
            }
            let all = hands[1]
                .union(hands[2])
                .union(stock.iter().copied().collect());
            assert_eq!(all, obs.unseen());
            assert_eq!(stock.len(), g.stock_len());
        }
    }

    #[test]
    fn learned_belief_fixes_lone_card_overestimate() {
        // 상대가 1장, 내가 4점: 실측 스톱 승률은 0.2 안팎 (전략서 H8). 균일 추정은 크게 과대평가한다
        use crate::card::parse_cards;
        let hand = |s: &str| -> CardSet { parse_cards(s).unwrap().into_iter().collect() };
        let g = Game::with_hands(
            Rules::default(),
            &[hand("4S"), hand("9H")],
            Some("QH".parse().unwrap()),
            &[],
            0,
            3,
        );
        let obs = g.observation(0);
        let mut rng = Rng::seed_from_u64(4);
        let uniform = stop_win_estimate(&obs, &mut rng, &UNIFORM, 2000);
        let learned = stop_win_estimate(&obs, &mut rng, &LEARNED, 2000);
        assert!(uniform > 0.6, "uniform {uniform}");
        assert!(learned < 0.3, "learned {learned}");
    }

    #[test]
    fn evidence_reads_thank_you_passes() {
        // 0번이 버린 카드를 1번이 땡큐하지 않고 받았다
        let mut g = Game::new(Rules::default(), 2, 21, 0).unwrap();
        g.apply(Action::Draw).unwrap();
        let card = g
            .legal_actions()
            .into_iter()
            .find_map(|a| match a {
                Action::Discard { card } => Some(card),
                _ => None,
            })
            .unwrap();
        g.apply(Action::Discard { card }).unwrap();
        g.apply(Action::Draw).unwrap();
        let ev = Evidence::from_obs(&g.observation(0), 3);
        assert_eq!(ev.passes[1], vec![card]);
        assert_eq!(ev.discards[0], vec![card]);
        assert!(ev.played[0] && !ev.played[1]);
    }

    #[test]
    fn bayes_penalizes_hands_that_contradict_a_pass() {
        use crate::card::parse_cards;
        let hand = |s: &str| -> CardSet { parse_cards(s).unwrap().into_iter().collect() };
        let ev = Evidence {
            passes: vec![vec![], parse_cards("9H").unwrap()],
            discards: vec![vec![], vec![]],
            played: vec![false, false],
        };
        let p = BayesParams::default();
        let rules = Rules::default();
        let bad = ev.log_weight(1, hand("9S 9D KC"), &rules, &p);
        let ok = ev.log_weight(1, hand("9S 2D KC"), &rules, &p);
        assert!(bad < ok - 2.0, "{bad} vs {ok}");
    }

    #[test]
    fn weights_bias_toward_low_ranks() {
        // 낮은 랭크에 큰 가중치를 주면 뽑힌 카드 평균 랭크가 내려간다
        let mut low = UNIFORM;
        for row in low.iter_mut() {
            for (r, w) in row.iter_mut().enumerate() {
                *w = 1.0 / (r as f64 + 1.0).powi(2);
            }
        }
        let mut rng = Rng::seed_from_u64(9);
        let mean = |table: &RankWeights, rng: &mut Rng| {
            let mut sum = 0u32;
            for _ in 0..400 {
                let mut pool: Vec<Card> = Card::all().collect();
                let h = draw_weighted(rng, &mut pool, 1, 1, table);
                sum += u32::from(h.iter().next().unwrap().rank());
            }
            f64::from(sum) / 400.0
        };
        assert!(mean(&low, &mut rng) < mean(&UNIFORM, &mut rng) - 2.0);
    }
}
