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

/// 학습된 가중치. `hoola-lab --only BELIEF`가 출력한 표 (전문가 봇·친구 페르소나 혼합 대전).
pub const LEARNED: RankWeights = UNIFORM;

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
