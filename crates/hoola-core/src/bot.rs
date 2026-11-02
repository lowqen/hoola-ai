//! 기준선 봇. ROADMAP §2.3 L0(Random), L1(Greedy).
//!
//! 봇은 [`Observation`]과 합법 수 목록만 받는다 (숨은 정보 접근 불가).

use crate::game::{Action, Game, Outcome};
use crate::observation::Observation;
use crate::rng::Rng;

/// 봇 공통 인터페이스.
pub trait Bot {
    fn name(&self) -> &str;

    /// `legal`은 비어 있지 않고, 반환값은 그중 하나여야 한다.
    fn act(&mut self, obs: &Observation<'_>, legal: &[Action]) -> Action;
}

/// L0: 합법 수 중 균일 무작위.
#[derive(Debug, Clone)]
pub struct RandomBot {
    rng: Rng,
}

impl RandomBot {
    pub fn new(seed: u64) -> RandomBot {
        RandomBot {
            rng: Rng::seed_from_u64(seed),
        }
    }
}

impl Bot for RandomBot {
    fn name(&self) -> &str {
        "L0-random"
    }

    fn act(&mut self, _obs: &Observation<'_>, legal: &[Action]) -> Action {
        legal[self.rng.below(legal.len() as u64) as usize]
    }
}

/// L1: 탐욕 기준선.
///
/// - 스톱할 수 있으면 즉시 스톱
/// - 땡큐할 수 있으면 손패 점수를 가장 많이 줄이는 조합으로 땡큐, 아니면 받기
/// - 등록할 수 있으면 점수를 가장 많이 줄이는 조합부터 등록, 그다음 붙이기
/// - 가장 점수가 높은 카드를 버린다
#[derive(Debug, Clone, Default)]
pub struct GreedyBot;

impl Bot for GreedyBot {
    fn name(&self) -> &str {
        "L1-greedy"
    }

    fn act(&mut self, obs: &Observation<'_>, legal: &[Action]) -> Action {
        let pts = |c| obs.rules.points.points(c);
        if legal.contains(&Action::Stop) {
            return Action::Stop;
        }
        // 손패에서 빠지는 점수가 큰 순 (땡큐는 가져온 카드를 뺀 손패 몫만 센다)
        let gain = |a: &Action| -> Option<u32> {
            match *a {
                Action::ThankYou { meld } => Some(meld.intersection(obs.hand).points(&obs.rules.points)),
                Action::Register { cards } => Some(cards.points(&obs.rules.points)),
                Action::Attach { card, .. } => Some(pts(card)),
                _ => None,
            }
        };
        let melding = legal
            .iter()
            .filter_map(|a| gain(a).map(|g| (g, *a)))
            .max_by_key(|&(g, a)| (g, matches!(a, Action::Register { .. } | Action::ThankYou { .. })));
        if let Some((_, a)) = melding {
            return a;
        }
        if legal.contains(&Action::Draw) {
            return Action::Draw;
        }
        legal
            .iter()
            .copied()
            .filter_map(|a| match a {
                Action::Discard { card } => Some((pts(card), std::cmp::Reverse(card), a)),
                _ => None,
            })
            .max_by_key(|&(p, c, _)| (p, c))
            .map(|(_, _, a)| a)
            .unwrap_or(legal[0])
    }
}

/// 봇들로 한 판을 끝까지 둔다. `bots[i]`가 좌석 i.
pub fn play_out(game: &mut Game, bots: &mut [&mut dyn Bot]) -> Outcome {
    assert_eq!(bots.len(), game.num_players(), "one bot per seat");
    while !game.is_over() {
        let seat = game.current_player();
        let legal = game.legal_actions();
        let action = bots[seat].act(&game.observation(seat), &legal);
        game.apply(action)
            .unwrap_or_else(|e| panic!("bot {} chose {e}", bots[seat].name()));
    }
    game.outcome().expect("game over").clone()
}
