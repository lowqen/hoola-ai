//! 상대 손패 추정 (결정화 샘플링).
//!
//! 균일 샘플링은 "상대가 높은 카드부터 버려 낮은 카드가 남는다"는 사실을 무시해 상대 점수를
//! 과대평가한다 (예: 1장 남은 상대의 카드를 무작위 카드로 본다). 학습된 가중치
//! [`LEARNED`]는 봇 대전 기록에서 "상대가 k장 들고 있을 때, 보이지 않는 카드 중 랭크 r이
//! 그 상대 손에 있을 상대 확률"을 측정한 표다 (`hoola-lab --only BELIEF`).

use crate::card::{Card, CardSet};
use crate::observation::Observation;
use crate::rng::Rng;

/// `[손패 장수 k (0..=7, 7은 7장 이상)][랭크 - 1]` → 상대 가중치.
pub type RankWeights = [[f64; 13]; 8];

/// 균일 (가중치 없음).
pub const UNIFORM: RankWeights = [[1.0; 13]; 8];

/// 학습된 가중치. `hoola-lab --only BELIEF`가 출력한 표 (전문가 봇·친구 페르소나 혼합 대전,
/// 2026-11-03). 보정 검증: 스톱 승률 추정의 Brier 점수 균일 0.153 → 학습 0.080,
/// 상대가 1장일 때 평균 추정 균일 0.52 / 학습 0.18 / 실제 0.16.
/// 7이 거의 0인 행은 7을 단독 등록하는 습관 때문이다.
#[rustfmt::skip]
pub const LEARNED: RankWeights = [
    [1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000],
    [4.086, 3.112, 2.264, 1.466, 0.879, 0.370, 0.020, 0.246, 0.235, 0.165, 0.100, 0.050, 0.027],
    [2.501, 2.463, 2.233, 1.844, 1.273, 0.689, 0.287, 0.424, 0.508, 0.385, 0.224, 0.114, 0.055],
    [2.096, 2.021, 1.926, 1.764, 1.467, 0.900, 0.353, 0.617, 0.682, 0.529, 0.343, 0.198, 0.105],
    [1.804, 1.777, 1.739, 1.655, 1.464, 1.061, 0.382, 0.783, 0.783, 0.635, 0.460, 0.296, 0.161],
    [1.795, 1.714, 1.695, 1.655, 1.429, 0.871, 0.020, 0.702, 0.937, 0.847, 0.647, 0.456, 0.252],
    [1.554, 1.531, 1.479, 1.452, 1.416, 0.989, 0.020, 0.868, 1.078, 0.943, 0.779, 0.588, 0.325],
    [1.272, 1.249, 1.231, 1.211, 1.203, 1.175, 0.880, 1.064, 0.945, 0.854, 0.759, 0.642, 0.518],
];

/// 추정 방식.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Belief {
    Uniform,
    Learned,
}

impl Belief {
    pub fn table(self) -> &'static RankWeights {
        match self {
            Belief::Uniform => &UNIFORM,
            Belief::Learned => &LEARNED,
        }
    }
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
        let mut x = (rng.next_u64() >> 11) as f64 / (1u64 << 53) as f64 * total;
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
