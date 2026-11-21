//! R0 천장 측정 (`--only R0`).
//!
//! 1. 오라클 대 고수: 숨은 정보를 보는 반칙 봇이 전문가 봇(`expert`)을 얼마나 이기는가.
//!    공정한 봇은 이 승률을 넘을 수 없으므로 "고수를 압도하는 봇"이 가능한지의 상한이 된다.
//!    - 공정: 같은 탐색을 정보 없이 (숨은 정보를 학습된 믿음으로 샘플링하는 PIMC, 비교 기준)
//!    - O-스톱: 전문가 봇 + 스톱만 정답을 안다 (지금 스톱하면 단독 승리인지)
//!    - O-손패: 상대 손패를 보고 수마다 롤아웃 (더미 순서는 모름)
//!    - O-전부: 상대 손패와 더미 순서까지 보고 수마다 롤아웃
//!
//!    롤아웃의 상대 정책은 실제 상대와 같은 전문가 봇이다 (상대 모델도 정확).
//! 2. 고수의 약점: 전문가 봇 셀프플레이의 결정마다, 같은 판을 공정한 탐색(PIMC)과 오라클로
//!    평가해 결정 종류별로 승률을 얼마나 흘리는지 잰다. 최선 수는 평가 A로 고르고 이득은
//!    독립 평가 B로 재서, 노이즈 최댓값 편향을 없앤다.

use std::fmt::Write as _;
use std::time::Instant;

use hoola_core::belief::sample_hidden;
use hoola_core::{
    Action, Belief, Bot, Card, CardSet, EndReason, ExpertBot, ExpertConfig, Game, Phase, Rng,
    Rules, SearchBot, SearchConfig,
};

use crate::rating::{deal_setup, par_map};

/// 오라클이 보는 정보.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Sight {
    /// 정보 없음 (공정한 PIMC).
    Fair,
    /// 스톱 판정만 정답을 안다.
    Stop,
    /// 상대 손패.
    Hands,
    /// 상대 손패와 더미 순서.
    Full,
}

impl Sight {
    fn label(self) -> &'static str {
        match self {
            Sight::Fair => "공정 탐색 (정보 없음)",
            Sight::Stop => "O-스톱 (스톱 정답만)",
            Sight::Hands => "O-손패 (상대 손패)",
            Sight::Full => "O-전부 (손패 + 더미 순서)",
        }
    }
}

struct Oracle {
    sight: Sight,
    k: usize,
    base: ExpertBot,
    rollout: ExpertConfig,
    rng: Rng,
}

impl Oracle {
    fn new(sight: Sight, k: usize, seed: u64) -> Oracle {
        Oracle {
            sight,
            k,
            base: ExpertBot::new(ExpertConfig::default(), seed ^ 0x0AC1E),
            rollout: ExpertConfig::default(),
            rng: Rng::seed_from_u64(seed),
        }
    }

    /// 오라클이 아는 만큼을 반영한 판 하나.
    fn world(&mut self, game: &Game, seat: usize) -> Game {
        if self.sight == Sight::Full {
            return game.clone();
        }
        let obs = game.observation(seat);
        if self.sight == Sight::Fair {
            let (hands, stock) = sample_hidden(&obs, &mut self.rng, Belief::Learned.table());
            let rng = Rng::seed_from_u64(self.rng.next_u64());
            return Game::from_observation(&obs, &hands, stock, rng);
        }
        let hands: Vec<CardSet> = (0..game.num_players()).map(|s| game.hand(s)).collect();
        let known = hands.iter().fold(CardSet::EMPTY, |a, &h| a.union(h));
        let mut stock: Vec<Card> = obs.unseen().difference(known).iter().collect();
        self.rng.shuffle(&mut stock);
        let rng = Rng::seed_from_u64(self.rng.next_u64());
        Game::from_observation(&obs, &hands, stock, rng)
    }

    fn rollout(&mut self, mut game: Game, seat: usize) -> f64 {
        let seed = self.rng.next_u64();
        let mut bots: Vec<ExpertBot> = (0..game.num_players())
            .map(|s| ExpertBot::new(self.rollout.clone(), seed.wrapping_add(s as u64)))
            .collect();
        while !game.is_over() {
            let s = game.current_player();
            let legal = game.legal_actions();
            let a = bots[s].act(&game.observation(s), &legal);
            game.apply(a).expect("rollout bot plays legal moves");
        }
        game.outcome().expect("over").rewards[seat]
    }

    /// 후보 수별 롤아웃 보상 표본 (`[수][샘플]`, 같은 샘플 번호는 같은 세계).
    fn values(&mut self, game: &Game, seat: usize, cands: &[Action]) -> Vec<Vec<f64>> {
        let mut values = vec![Vec::with_capacity(self.k); cands.len()];
        for _ in 0..self.k {
            let world = self.world(game, seat);
            for (i, &a) in cands.iter().enumerate() {
                let mut g = world.clone();
                g.apply(a).expect("legal in every world");
                values[i].push(self.rollout(g, seat));
            }
        }
        values
    }

    /// 지금 스톱하면 단독 승리인가 (실제 손패로 판정).
    fn stop_wins(game: &Game, seat: usize) -> bool {
        let mut g = game.clone();
        g.apply(Action::Stop).is_ok()
            && g.outcome()
                .is_some_and(|o| o.winners.len() == 1 && o.winners[0] == seat)
    }

    /// 둘 수와, 전문가 봇의 수(기본)에서 바꿨는지.
    fn act(&mut self, game: &Game, seat: usize, legal: &[Action]) -> (Action, bool) {
        let obs = game.observation(seat);
        let default = self.base.act(&obs, legal);
        if self.sight == Sight::Stop {
            if !legal.contains(&Action::Stop) {
                return (default, false);
            }
            let a = if Self::stop_wins(game, seat) {
                Action::Stop
            } else if default == Action::Stop {
                let rest: Vec<Action> = legal
                    .iter()
                    .copied()
                    .filter(|&a| a != Action::Stop)
                    .collect();
                self.base.act(&obs, &rest)
            } else {
                default
            };
            return (a, a != default);
        }
        if legal.len() < 2 {
            return (default, false);
        }
        let d = legal
            .iter()
            .position(|&a| a == default)
            .expect("default is legal");
        let values = self.values(game, seat, legal);
        let mut best: Option<(f64, usize)> = None;
        for (i, v) in values.iter().enumerate() {
            if i == d {
                continue;
            }
            let diffs: Vec<f64> = v.iter().zip(&values[d]).map(|(a, b)| a - b).collect();
            let (gain, se) = mean_se(&diffs);
            if gain > 2.0 * se && gain > 0.0 && best.is_none_or(|(g, _)| gain > g) {
                best = Some((gain, i));
            }
        }
        best.map_or((default, false), |(_, i)| (legal[i], true))
    }
}

fn mean_se(v: &[f64]) -> (f64, f64) {
    let n = v.len() as f64;
    let mean = v.iter().sum::<f64>() / n;
    if v.len() < 2 {
        return (mean, f64::INFINITY);
    }
    let var = v.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    (mean, (var / n).sqrt())
}

fn mean_of(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}

/// 오라클 좌석 관점의 종료 사유: 내 털기, 내 스톱 성공, 내 스톱 실패, 상대 털기, 상대 스톱 성공, 상대 스톱 실패, 기타.
const ENDS: [&str; 7] = [
    "내 털기",
    "내 스톱 성공",
    "내 스톱 실패",
    "상대 털기",
    "상대 스톱 성공",
    "상대 스톱 실패",
    "기타",
];

fn end_kind(reason: EndReason, seat: usize) -> usize {
    match reason {
        EndReason::Out { player } if player == seat => 0,
        EndReason::Stop { caller, success } if caller == seat => {
            if success {
                1
            } else {
                2
            }
        }
        EndReason::Out { .. } => 3,
        EndReason::Stop { success: true, .. } => 4,
        EndReason::Stop { success: false, .. } => 5,
        _ => 6,
    }
}

#[derive(Default, Clone)]
struct DuelPart {
    /// 딜 단위 오라클 평균 보상의 합·제곱합, 딜 수.
    sx: f64,
    sxx: f64,
    deals: f64,
    games: f64,
    ends: [f64; 7],
    /// 오라클이 전문가 봇과 다른 수를 둔 횟수 / 오라클 결정 수.
    deviations: f64,
    decisions: f64,
    secs: f64,
}

fn duel(
    sight: Sight,
    k: usize,
    n: usize,
    deals: std::ops::Range<u64>,
    seed: u64,
    rules: &Rules,
) -> DuelPart {
    let started = Instant::now();
    let mut p = DuelPart::default();
    for deal in deals {
        let (game_seed, first) = deal_setup(rules, n, seed, deal);
        let mut sum = 0.0;
        // 오라클이 좌석을 돌아가며 앉는다 (나머지는 전문가 봇)
        for oracle_seat in 0..n {
            let mut game = Game::new(rules.clone(), n, game_seed, first).expect("valid rules");
            let mut oracle = Oracle::new(sight, k, game_seed ^ 0xC0FFEE ^ oracle_seat as u64);
            let mut experts: Vec<ExpertBot> = (0..n)
                .map(|s| {
                    ExpertBot::new(
                        ExpertConfig::default(),
                        game_seed.wrapping_mul(1000) + s as u64,
                    )
                })
                .collect();
            while !game.is_over() {
                let s = game.current_player();
                let legal = game.legal_actions();
                let a = if s == oracle_seat {
                    let (a, changed) = oracle.act(&game, s, &legal);
                    if legal.len() >= 2 {
                        p.decisions += 1.0;
                        if changed {
                            p.deviations += 1.0;
                        }
                    }
                    a
                } else {
                    experts[s].act(&game.observation(s), &legal)
                };
                game.apply(a).expect("legal");
            }
            let outcome = game.outcome().expect("over");
            sum += outcome.rewards[oracle_seat];
            p.ends[end_kind(outcome.reason, oracle_seat)] += 1.0;
            p.games += 1.0;
        }
        let x = sum / n as f64;
        p.sx += x;
        p.sxx += x * x;
        p.deals += 1.0;
    }
    p.secs = started.elapsed().as_secs_f64();
    p
}

/// 결정 종류.
const KINDS: [&str; 5] = [
    "스톱함 (스톱 가능)",
    "스톱 안 함 (스톱 가능)",
    "땡큐 / 받기",
    "등록·붙이기 / 보류",
    "버릴 카드",
];

fn kind(phase: Phase, legal: &[Action], chosen: Action) -> usize {
    match phase {
        Phase::TurnStart if legal.contains(&Action::Stop) => {
            if chosen == Action::Stop {
                0
            } else {
                1
            }
        }
        Phase::TurnStart => 2,
        _ if legal
            .iter()
            .any(|a| matches!(a, Action::Register { .. } | Action::Attach { .. })) =>
        {
            3
        }
        _ => 4,
    }
}

#[derive(Default, Clone)]
struct WeakPart {
    games: f64,
    /// 종류별: 결정 수, 공정 탐색 기준 유의 이탈 수, 공정 이득 합, 오라클 이탈 수, 오라클 이득 합.
    n: [f64; 5],
    fair_dev: [f64; 5],
    fair_gain: [f64; 5],
    oracle_dev: [f64; 5],
    oracle_gain: [f64; 5],
    secs: f64,
}

/// 평가 A로 최선 수를 고르고(전문가 수보다 유의하게 좋을 때만), 평가 B로 이득을 잰다.
fn judge(a: &[Vec<f64>], b: &[Vec<f64>], d: usize) -> Option<f64> {
    let mut best: Option<(f64, usize)> = None;
    for (i, v) in a.iter().enumerate() {
        if i == d {
            continue;
        }
        let diffs: Vec<f64> = v.iter().zip(&a[d]).map(|(x, y)| x - y).collect();
        let (gain, se) = mean_se(&diffs);
        if gain > 2.0 * se && gain > 0.0 && best.is_none_or(|(g, _)| gain > g) {
            best = Some((gain, i));
        }
    }
    best.map(|(_, i)| mean_of(&b[i]) - mean_of(&b[d]))
}

fn search_values(seed: u64, k: usize, game: &Game, seat: usize, legal: &[Action]) -> Vec<Vec<f64>> {
    // SearchBot::evaluate는 평균만 주므로, 샘플 단위 값이 필요해 k번 1샘플 평가를 모은다
    let mut out = vec![Vec::with_capacity(k); legal.len()];
    let obs = game.observation(seat);
    for i in 0..k as u64 {
        let mut bot = SearchBot::new(
            SearchConfig {
                k: 1,
                ..SearchConfig::default()
            },
            seed.wrapping_add(i.wrapping_mul(0x9E37_79B9)),
        );
        for (slot, v) in out.iter_mut().zip(bot.evaluate(&obs, legal)) {
            slot.push(v.value);
        }
    }
    out
}

fn weakness(
    n: usize,
    deals: std::ops::Range<u64>,
    seed: u64,
    rules: &Rules,
    k_fair: usize,
    k_oracle: usize,
) -> WeakPart {
    let started = Instant::now();
    let mut p = WeakPart::default();
    for deal in deals {
        let (game_seed, first) = deal_setup(rules, n, seed, deal);
        let mut game = Game::new(rules.clone(), n, game_seed, first).expect("valid rules");
        let mut experts: Vec<ExpertBot> = (0..n)
            .map(|s| {
                ExpertBot::new(
                    ExpertConfig::default(),
                    game_seed.wrapping_mul(1000) + s as u64,
                )
            })
            .collect();
        let mut step = 0u64;
        while !game.is_over() {
            let s = game.current_player();
            let legal = game.legal_actions();
            let a = experts[s].act(&game.observation(s), &legal);
            if legal.len() >= 2 {
                step += 1;
                let d = legal.iter().position(|&x| x == a).expect("legal");
                let kd = kind(game.phase(), &legal, a);
                let base = game_seed ^ step.wrapping_mul(0xA24B_AED4_963E_E407);
                p.n[kd] += 1.0;
                let fa = search_values(base, k_fair, &game, s, &legal);
                let fb = search_values(base ^ 0xB, k_fair, &game, s, &legal);
                if let Some(g) = judge(&fa, &fb, d) {
                    p.fair_dev[kd] += 1.0;
                    p.fair_gain[kd] += g;
                }
                let oa = Oracle::new(Sight::Full, k_oracle, base ^ 0x0A).values(&game, s, &legal);
                let ob = Oracle::new(Sight::Full, k_oracle, base ^ 0x0B).values(&game, s, &legal);
                if let Some(g) = judge(&oa, &ob, d) {
                    p.oracle_dev[kd] += 1.0;
                    p.oracle_gain[kd] += g;
                }
            }
            game.apply(a).expect("legal");
        }
        p.games += 1.0;
    }
    p.secs = started.elapsed().as_secs_f64();
    p
}

fn add5(a: &mut [f64; 5], b: &[f64; 5]) {
    for (x, y) in a.iter_mut().zip(b) {
        *x += y;
    }
}

fn chunks(deals: u64, parts: u64) -> Vec<std::ops::Range<u64>> {
    let per = deals.div_ceil(parts).max(1);
    (0..deals)
        .step_by(per as usize)
        .map(|s| s..(s + per).min(deals))
        .collect()
}

/// R0 전체를 돌려 마크다운으로 쓴다.
pub fn run(
    md: &mut String,
    players: &[usize],
    deals: u64,
    seed: u64,
    rules: &Rules,
    preset_name: &str,
) {
    let _ = writeln!(md, "# R0 천장 측정 (`{preset_name}`)\n");
    let _ = writeln!(
        md,
        "- 오라클은 상대가 전문가 봇이라는 것도 안다 (롤아웃 상대 정책 = 실제 상대). 수는 전문가 봇의 수를 기본으로 두고, 같은 세계로 짝지은 차이가 표준오차 2배를 넘는 수가 있을 때만 바꾼다\n\
         - 듀플리케이트: 딜마다 오라클이 모든 좌석에 한 번씩 앉는다. ±는 딜 단위 95% 반폭\n"
    );
    let oracles: [(Sight, usize); 4] = [
        (Sight::Fair, 64),
        (Sight::Stop, 1),
        (Sight::Hands, 64),
        (Sight::Full, 16),
    ];
    for &n in players {
        if rules.validate(n).is_err() {
            continue;
        }
        let d = if n == 2 { deals } else { (deals / 2).max(1) };
        let _ = writeln!(md, "## {n}인 · 오라클 vs 전문가 봇 ×{}\n", n - 1);
        let _ = writeln!(
            md,
            "| 오라클 | k | 딜 | 오라클 승률 (공평 {:.1}%) | ± | 기준 대비 | 고수 대비 Elo | 수 바꾼 비율 | {} | 판당 시간 |\n|---|---|---|---|---|---|---|---|{}---|",
            100.0 / n as f64,
            ENDS.join(" | "),
            "---|".repeat(ENDS.len())
        );
        for &(sight, k) in &oracles {
            let started = Instant::now();
            let ranges = chunks(d, 64);
            let parts = par_map(&ranges, |r| duel(sight, k, n, r.clone(), seed, rules));
            let mut t = DuelPart::default();
            for p in &parts {
                t.sx += p.sx;
                t.sxx += p.sxx;
                t.deals += p.deals;
                t.games += p.games;
                t.deviations += p.deviations;
                t.decisions += p.decisions;
                t.secs += p.secs;
                for (a, b) in t.ends.iter_mut().zip(&p.ends) {
                    *a += b;
                }
            }
            let mean = t.sx / t.deals;
            let var = (t.sxx / t.deals - mean * mean).max(0.0) * t.deals / (t.deals - 1.0).max(1.0);
            let ci = 1.96 * (var / t.deals).sqrt();
            let fair = 1.0 / n as f64;
            // 2인은 보통의 Elo. n인은 오라클과 상대 한 명 중 한쪽만 이긴 판에서 오라클 몫으로 환산한다
            let p_pair = if n == 2 {
                mean
            } else {
                mean / (mean + (1.0 - mean) / (n as f64 - 1.0))
            };
            let elo = 400.0 * (p_pair / (1.0 - p_pair)).log10();
            let ends: Vec<String> = t
                .ends
                .iter()
                .map(|e| format!("{:.1}%", 100.0 * e / t.games))
                .collect();
            let _ = writeln!(
                md,
                "| {} | {k} | {d} | **{:.2}%** | ±{:.2}%p | {:+.2}%p | {elo:+.0} | {:.1}% | {} | {:.2}초 |",
                sight.label(),
                100.0 * mean,
                100.0 * ci,
                100.0 * (mean - fair),
                100.0 * t.deviations / t.decisions.max(1.0),
                ends.join(" | "),
                t.secs / t.games,
            );
            eprintln!(
                "R0 {n}p {:?} done ({:.0}s)",
                sight,
                started.elapsed().as_secs_f64()
            );
        }
        let _ = writeln!(md);
    }

    // 고수의 약점
    let (k_fair, k_oracle) = (128, 32);
    let _ = writeln!(
        md,
        "## 고수(전문가 봇)의 약점: 결정 종류별 승률 손실\n\n\
         전문가 봇 셀프플레이의 결정(합법 수 2개 이상)마다 모든 합법 수를 평가했다. \
         **공정** = 관측과 맞는 숨은 정보를 샘플링한 탐색(PIMC, 샘플 {k_fair}개, 실제로 만들 수 있는 개선의 하한 추정), \
         **오라클** = 실제 판 그대로 롤아웃(샘플 {k_oracle}개, 정보까지 안다면 얻을 개선). \
         평가 A에서 전문가 수보다 유의하게 좋은 수가 있으면 이탈로 세고, 그 수의 이득은 독립 평가 B로 쟀다. \
         \"이탈당 이득\"은 이탈 한 번에 더 좋은 수가 주는 승률, \"판당 손실\"은 한 판에서 그 종류 결정으로 흘린 승률의 합(좌석 하나 기준)이다. \
         오라클 쪽은 같은 정보를 결정마다 다시 쓰므로 판당 합이 실제로 얻을 수 있는 승률보다 훨씬 크다. 종류별 비교에만 쓴다.\n"
    );
    for &n in players {
        if rules.validate(n).is_err() {
            continue;
        }
        let started = Instant::now();
        let d = if n == 2 {
            (deals / 4).max(1)
        } else {
            (deals / 8).max(1)
        };
        let ranges = chunks(d, 64);
        let parts = par_map(&ranges, |r| {
            weakness(n, r.clone(), seed + 7_000_000, rules, k_fair, k_oracle)
        });
        let mut t = WeakPart::default();
        for p in &parts {
            t.games += p.games;
            t.secs += p.secs;
            add5(&mut t.n, &p.n);
            add5(&mut t.fair_dev, &p.fair_dev);
            add5(&mut t.fair_gain, &p.fair_gain);
            add5(&mut t.oracle_dev, &p.oracle_dev);
            add5(&mut t.oracle_gain, &p.oracle_gain);
        }
        // 셀프플레이라 결정은 n좌석 몫이다. 판당 손실은 좌석 하나 기준으로 나눈다.
        let seats = t.games * n as f64;
        let _ = writeln!(
            md,
            "### {n}인 (판 {:.0}, 판당 {:.1}초)\n\n| 결정 | 좌석·판당 결정 수 | 공정: 이탈률 | 공정: 이탈당 이득 | 공정: 판당 손실 | 오라클: 이탈률 | 오라클: 이탈당 이득 | 오라클: 판당 손실 |\n|---|---|---|---|---|---|---|---|",
            t.games,
            t.secs / t.games.max(1.0)
        );
        let (mut fs, mut os) = (0.0, 0.0);
        for (i, name) in KINDS.iter().enumerate() {
            let c = t.n[i].max(1.0);
            fs += t.fair_gain[i];
            os += t.oracle_gain[i];
            let _ = writeln!(
                md,
                "| {name} | {:.2} | {:.1}% | {:.1}%p | {:.2}%p | {:.1}% | {:.1}%p | {:.2}%p |",
                t.n[i] / seats,
                100.0 * t.fair_dev[i] / c,
                100.0 * t.fair_gain[i] / t.fair_dev[i].max(1.0),
                100.0 * t.fair_gain[i] / seats,
                100.0 * t.oracle_dev[i] / c,
                100.0 * t.oracle_gain[i] / t.oracle_dev[i].max(1.0),
                100.0 * t.oracle_gain[i] / seats,
            );
        }
        let _ = writeln!(
            md,
            "| **합계** | {:.2} | | | **{:.2}%p** | | | **{:.2}%p** |\n",
            t.n.iter().sum::<f64>() / seats,
            100.0 * fs / seats,
            100.0 * os / seats
        );
        eprintln!(
            "R0 weakness {n}p done ({:.0}s)",
            started.elapsed().as_secs_f64()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oracle_worlds_keep_true_hands() {
        let mut g = Game::new(Rules::default(), 3, 11, 0).unwrap();
        g.apply(Action::Draw).unwrap();
        let mut o = Oracle::new(Sight::Hands, 2, 5);
        let w = o.world(&g, 0);
        for s in 0..3 {
            assert_eq!(w.hand(s), g.hand(s));
        }
        assert_eq!(w.stock_len(), g.stock_len());
    }

    #[test]
    fn oracle_duel_runs() {
        let p = duel(Sight::Full, 2, 2, 0..2, 1, &Rules::default());
        assert_eq!(p.games, 4.0);
        assert!(p.sx >= 0.0 && p.sx <= 2.0);
        let w = weakness(2, 0..1, 1, &Rules::default(), 2, 2);
        assert_eq!(w.games, 1.0);
    }
}
