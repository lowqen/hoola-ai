//! R1: 신경망 없는 탐색 고도화 (`--only R1`).
//!
//! 1. 믿음 진단: 전략서 봇 셀프플레이에서 상대 손패 샘플이 실제 손패와 얼마나 맞는지
//!    (카드 적중률, 점수 오차)를 학습된 표와 베이즈 증거별로 비교한다.
//! 2. 후보 탐색 봇 vs 전략서 봇: 듀플리케이트 승률, 기준 대비 Elo, 판당 시간.

use std::fmt::Write as _;
use std::time::Instant;

use hoola_core::arena::{MatchConfig, MatchReport};
use hoola_core::belief::{BayesParams, Evidence, LEARNED, sample_hidden, sample_hidden_bayes};
use hoola_core::{Bot, ExpertBot, ExpertConfig, Game, Rules};

use crate::rating::{deal_setup, par_map};
use crate::run_all;

/// 탐색 봇 후보 (이름, 사양).
pub const CANDIDATES: &[(&str, &str)] = &[
    ("현재 웹 탐색 봇", "search:k=128"),
    ("+ 등록 탐색", "search:k=128:meld=1"),
    ("+ 베이즈 믿음", "search:k=128:belief=bayes"),
    ("+ 등록 탐색 + 베이즈", "search:k=128:meld=1:belief=bayes"),
    ("+ 둘 다, 기준 z=1", "search:k=128:meld=1:belief=bayes:z=1"),
    ("+ 둘 다, k=256", "search:k=256:meld=1:belief=bayes"),
    ("+ 둘 다, 스톱도 탐색", "search:k=128:meld=1:belief=bayes:stop=1"),
];

/// 믿음 진단 변형 (이름, 증거 강도). `None`은 학습된 표만.
fn belief_variants() -> Vec<(&'static str, Option<BayesParams>)> {
    let d = BayesParams::default();
    let only = |pass: f64, meld: f64, discard: f64| BayesParams {
        pass,
        meld,
        discard,
        ..d
    };
    vec![
        ("학습된 표만", None),
        ("베이즈 (기본: 넘김 0.1, 조합 0.3, 버림 0.7)", Some(d)),
        ("땡큐 넘김만", Some(only(d.pass, 1.0, 1.0))),
        ("남은 조합만", Some(only(1.0, d.meld, 1.0))),
        ("버림만", Some(only(1.0, 1.0, d.discard))),
        ("강하게 (0.02, 0.1, 0.5)", Some(only(0.02, 0.1, 0.5))),
        (
            "후보 64",
            Some(BayesParams {
                candidates: 64,
                ..d
            }),
        ),
    ]
}

#[derive(Clone, Default)]
struct Diag {
    /// 변형별: 표본 수, 적중 카드 비율 합, 점수 절대오차 합.
    n: Vec<f64>,
    hit: Vec<f64>,
    err: Vec<f64>,
}

fn diagnose(n: usize, deals: std::ops::Range<u64>, seed: u64, rules: &Rules) -> Diag {
    let variants = belief_variants();
    let v = variants.len();
    let mut d = Diag {
        n: vec![0.0; v],
        hit: vec![0.0; v],
        err: vec![0.0; v],
    };
    for deal in deals {
        let (game_seed, first) = deal_setup(rules, n, seed, deal);
        let mut game = Game::new(rules.clone(), n, game_seed, first).expect("valid rules");
        let mut bots: Vec<ExpertBot> = (0..n)
            .map(|s| ExpertBot::new(ExpertConfig::default(), game_seed.wrapping_mul(1000) + s as u64))
            .collect();
        let mut rng = hoola_core::Rng::seed_from_u64(game_seed ^ 0xD1A6);
        while !game.is_over() {
            let s = game.current_player();
            let obs = game.observation(s);
            // 차례 시작마다 상대 손패를 추정해 본다
            if obs.phase == hoola_core::Phase::TurnStart && game.turn() > n as u32 {
                for (i, (_, params)) in variants.iter().enumerate() {
                    let ev = params.map(|p| (Evidence::from_obs(&obs, p.recent), p));
                    for _ in 0..8 {
                        let (hands, _) = match &ev {
                            Some((ev, p)) => sample_hidden_bayes(&obs, &mut rng, &LEARNED, ev, p),
                            None => sample_hidden(&obs, &mut rng, &LEARNED),
                        };
                        for o in (0..n).filter(|&o| o != s) {
                            let truth = game.hand(o);
                            if truth.is_empty() {
                                continue;
                            }
                            d.n[i] += 1.0;
                            d.hit[i] +=
                                hands[o].intersection(truth).len() as f64 / truth.len() as f64;
                            d.err[i] += (f64::from(hands[o].points(&rules.points))
                                - f64::from(truth.points(&rules.points)))
                            .abs();
                        }
                    }
                }
            }
            let legal = game.legal_actions();
            let a = bots[s].act(&obs, &legal);
            game.apply(a).expect("legal");
        }
    }
    d
}

fn cfg(bots: Vec<String>, deals: u64, seed: u64, rules: &Rules) -> MatchConfig {
    MatchConfig {
        rules: rules.clone(),
        players: bots.len(),
        deals,
        seed,
        bots,
        duplicate: true,
    }
}

/// R1 실험을 돌려 마크다운으로 쓴다.
pub fn run(md: &mut String, players: &[usize], deals: u64, seed: u64, rules: &Rules) {
    let _ = writeln!(md, "# R1 탐색 고도화\n");
    for &n in players {
        if rules.validate(n).is_err() {
            continue;
        }
        // 1. 믿음 진단
        let started = Instant::now();
        let diag_deals = (deals / 4).max(1);
        let ranges: Vec<std::ops::Range<u64>> = (0..32u64)
            .map(|p| {
                let per = diag_deals.div_ceil(32);
                (p * per).min(diag_deals)..((p + 1) * per).min(diag_deals)
            })
            .collect();
        let parts = par_map(&ranges, |r| diagnose(n, r.clone(), seed + 9_000_000, rules));
        let v = belief_variants();
        let mut t = Diag {
            n: vec![0.0; v.len()],
            hit: vec![0.0; v.len()],
            err: vec![0.0; v.len()],
        };
        for p in &parts {
            add(&mut t.n, &p.n);
            add(&mut t.hit, &p.hit);
            add(&mut t.err, &p.err);
        }
        let _ = writeln!(
            md,
            "## {n}인 · 믿음 진단 (전략서 봇 셀프플레이 {diag_deals}판, 차례 시작마다 8샘플, {:.0}초)\n\n\
             적중 = 샘플 손패 중 실제 손패에 있는 카드 비율, 점수 오차 = 샘플 손패 점수와 실제 점수의 차 (절댓값 평균).\n\n\
             | 추정 | 적중 | 점수 오차 |\n|---|---|---|",
            started.elapsed().as_secs_f64()
        );
        for (i, (name, _)) in v.iter().enumerate() {
            let _ = writeln!(
                md,
                "| {name} | {:.1}% | {:.2}점 |",
                100.0 * t.hit[i] / t.n[i].max(1.0),
                t.err[i] / t.n[i].max(1.0)
            );
        }
        let _ = writeln!(md);

        // 2. 후보 vs 전략서 봇 (후보마다 따로 돌려 판당 시간을 잰다)
        let d = if n == 2 { deals } else { (deals / 2).max(1) };
        let parts_per = 16u64;
        let threads = std::thread::available_parallelism().map_or(1, |t| t.get()) as f64;
        let _ = writeln!(
            md,
            "## {n}인 · 후보 vs 전략서 봇 ×{} (딜 {d}, 듀플리케이트)\n\n\
             | 후보 | 사양 | 승률 | 95% CI | 공평 몫 대비 | 전략서 대비 Elo | 판당 시간 |\n|---|---|---|---|---|---|---|",
            n - 1
        );
        for &(name, spec) in CANDIDATES {
            let mut bots = vec![spec.to_string()];
            bots.extend(std::iter::repeat_n("expert".to_string(), n - 1));
            let per = d.div_ceil(parts_per);
            let configs = (0..parts_per)
                .map(|p| cfg(bots.clone(), per, seed + 3_000_000 + p * per, rules))
                .collect();
            let t0 = Instant::now();
            let reports = run_all(configs);
            let secs = t0.elapsed().as_secs_f64();
            let games: u64 = reports.iter().map(|r| r.games).sum();
            let (mean, ci) = merged(&reports, spec);
            let fair = 1.0 / n as f64;
            let p_pair = if n == 2 {
                mean
            } else {
                mean / (mean + (1.0 - mean) / (n as f64 - 1.0))
            };
            let elo = 400.0 * (p_pair / (1.0 - p_pair)).log10();
            let _ = writeln!(
                md,
                "| {name} | `{spec}` | **{:.2}%** | ±{:.2}%p | {:+.2}%p | {elo:+.0} | {:.3}초 |",
                100.0 * mean,
                100.0 * ci,
                100.0 * (mean - fair),
                secs * threads / games.max(1) as f64,
            );
            eprintln!("R1 {n}p {spec} done");
        }
        let _ = writeln!(md);
        eprintln!("R1 {n}p done ({:.0}s)", started.elapsed().as_secs_f64());
    }
}

fn add(a: &mut [f64], b: &[f64]) {
    for (x, y) in a.iter_mut().zip(b) {
        *x += y;
    }
}

fn merged(reports: &[MatchReport], bot: &str) -> (f64, f64) {
    let k = reports.len() as f64;
    let mean = reports.iter().map(|r| r.bot(bot).unwrap().mean).sum::<f64>() / k;
    let ci = reports
        .iter()
        .map(|r| r.bot(bot).unwrap().ci95.powi(2))
        .sum::<f64>()
        .sqrt()
        / k;
    (mean, ci)
}
