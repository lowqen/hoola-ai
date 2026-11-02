//! BELIEF: 상대 손패 가중치 학습 + 스톱 승률 추정 보정(calibration) 검증.

// 고정 크기 표를 k·r로 함께 인덱싱하는 실험 코드라 범위 루프가 더 읽기 쉽다
#![allow(clippy::needless_range_loop)]

use std::fmt::Write as _;

use hoola_core::arena::NamedBot;
use hoola_core::belief::{RankWeights, UNIFORM, stop_win_estimate};
use hoola_core::{Action, Bot, Game, Phase, Rng, Rules};

const LINEUPS: &[&[&str]] = &[
    &["expert", "expert"],
    &["expert", "expert:stop=never"],
    &["expert", "expert:stop=never:meld=allin"],
    &["expert", "expert:stop=t2:meld=hold"],
    &["expert", "expert", "expert"],
    &[
        "expert",
        "expert:stop=never",
        "expert:stop=never:meld=allin",
    ],
    &["expert", "expert:stop=t2:meld=hold", "expert:stop=never"],
];

/// 한 판을 두면서 차례 시작마다 `visit(game, seat)`를 부른다. 배치는 딜마다 돌린다.
fn play_deals(
    lineup: &[&str],
    seeds: std::ops::Range<u64>,
    rules: &Rules,
    mut visit: impl FnMut(&Game, usize),
) {
    let n = lineup.len();
    for seed in seeds {
        let mut g = Game::new(rules.clone(), n, seed, (seed % n as u64) as usize).expect("valid");
        let seating: Vec<&str> = (0..n).map(|s| lineup[(s + seed as usize) % n]).collect();
        let mut bots: Vec<NamedBot> = seating
            .iter()
            .enumerate()
            .map(|(s, name)| NamedBot::new(name, seed.wrapping_mul(977) + s as u64).expect("bot"))
            .collect();
        while !g.is_over() {
            let seat = g.current_player();
            if g.phase() == Phase::TurnStart {
                visit(&g, seat);
            }
            let legal = g.legal_actions();
            let a = bots[seat].act(&g.observation(seat), &legal);
            g.apply(a).expect("legal");
        }
    }
}

/// `[장수][랭크]` 누적 개수.
type Counts = [[f64; 13]; 8];

/// 손패 장수 k별, 보이지 않는 카드 중 랭크 r이 그 상대 손에 있는 비율 → 평균 1로 정규화한 가중치.
pub fn learn_weights(deals: u64, seed: u64, rules: &Rules) -> (RankWeights, [[u64; 13]; 8]) {
    let parts: Vec<(Counts, Counts)> = std::thread::scope(|scope| {
        let handles: Vec<_> = LINEUPS
            .iter()
            .enumerate()
            .map(|(li, lineup)| {
                scope.spawn(move || {
                    let mut num = [[0f64; 13]; 8];
                    let mut den = [[0f64; 13]; 8];
                    let base = seed + li as u64 * 10_000_000;
                    play_deals(lineup, base..base + deals, rules, |g, seat| {
                        let obs = g.observation(seat);
                        let unseen = obs.unseen();
                        for o in 0..g.num_players() {
                            if o == seat {
                                continue;
                            }
                            let hand = g.hand(o);
                            let k = hand.len().min(7);
                            for c in unseen.iter() {
                                let r = (c.rank() - 1) as usize;
                                den[k][r] += 1.0;
                                if hand.contains(c) {
                                    num[k][r] += 1.0;
                                }
                            }
                        }
                    });
                    (num, den)
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    let mut num = [[0f64; 13]; 8];
    let mut den = [[0f64; 13]; 8];
    for (pn, pd) in parts {
        for k in 0..8 {
            for r in 0..13 {
                num[k][r] += pn[k][r];
                den[k][r] += pd[k][r];
            }
        }
    }
    let mut w = UNIFORM;
    let mut held = [[0u64; 13]; 8];
    for k in 1..8 {
        let rates: Vec<f64> = (0..13)
            .map(|r| {
                if den[k][r] > 0.0 {
                    num[k][r] / den[k][r]
                } else {
                    0.0
                }
            })
            .collect();
        let mean = rates.iter().sum::<f64>() / 13.0;
        let total_held: f64 = num[k].iter().sum();
        if mean > 0.0 && total_held >= 2000.0 {
            for r in 0..13 {
                w[k][r] = (rates[r] / mean).max(0.02);
            }
        }
        for r in 0..13 {
            held[k][r] = num[k][r] as u64;
        }
    }
    (w, held)
}

struct Cal {
    bins_u: [(f64, f64, u64); 10],
    bins_l: [(f64, f64, u64); 10],
    brier_u: f64,
    brier_l: f64,
    by_fewest: [(f64, f64, f64, u64); 5], // (est_u 합, est_l 합, 실제 합, 수)
    n: u64,
}

fn calibrate(deals: u64, seed: u64, rules: &Rules, learned: &RankWeights) -> Cal {
    let parts: Vec<Cal> = std::thread::scope(|scope| {
        let handles: Vec<_> = LINEUPS
            .iter()
            .enumerate()
            .map(|(li, lineup)| {
                scope.spawn(move || {
                    let mut c = Cal {
                        bins_u: [(0.0, 0.0, 0); 10],
                        bins_l: [(0.0, 0.0, 0); 10],
                        brier_u: 0.0,
                        brier_l: 0.0,
                        by_fewest: [(0.0, 0.0, 0.0, 0); 5],
                        n: 0,
                    };
                    let mut rng = Rng::seed_from_u64(seed ^ li as u64);
                    let base = seed + 500_000_000 + li as u64 * 10_000_000;
                    play_deals(lineup, base..base + deals, rules, |g, seat| {
                        if !g.legal_actions().contains(&Action::Stop) {
                            return;
                        }
                        let obs = g.observation(seat);
                        let mine = g.hand_points(seat);
                        let truth =
                            (0..g.num_players()).all(|s| s == seat || g.hand_points(s) > mine);
                        let y = f64::from(u8::from(truth));
                        let eu = stop_win_estimate(&obs, &mut rng, &UNIFORM, 32);
                        let el = stop_win_estimate(&obs, &mut rng, learned, 32);
                        let bin = |p: f64| ((p * 10.0) as usize).min(9);
                        let bu = &mut c.bins_u[bin(eu)];
                        bu.0 += eu;
                        bu.1 += y;
                        bu.2 += 1;
                        let bl = &mut c.bins_l[bin(el)];
                        bl.0 += el;
                        bl.1 += y;
                        bl.2 += 1;
                        c.brier_u += (eu - y).powi(2);
                        c.brier_l += (el - y).powi(2);
                        let fewest = (0..g.num_players())
                            .filter(|&s| s != seat)
                            .map(|s| g.hand(s).len())
                            .min()
                            .unwrap_or(7)
                            .clamp(1, 5)
                            - 1;
                        let f = &mut c.by_fewest[fewest];
                        f.0 += eu;
                        f.1 += el;
                        f.2 += y;
                        f.3 += 1;
                        c.n += 1;
                    });
                    c
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    let mut total = Cal {
        bins_u: [(0.0, 0.0, 0); 10],
        bins_l: [(0.0, 0.0, 0); 10],
        brier_u: 0.0,
        brier_l: 0.0,
        by_fewest: [(0.0, 0.0, 0.0, 0); 5],
        n: 0,
    };
    for p in parts {
        for i in 0..10 {
            total.bins_u[i].0 += p.bins_u[i].0;
            total.bins_u[i].1 += p.bins_u[i].1;
            total.bins_u[i].2 += p.bins_u[i].2;
            total.bins_l[i].0 += p.bins_l[i].0;
            total.bins_l[i].1 += p.bins_l[i].1;
            total.bins_l[i].2 += p.bins_l[i].2;
        }
        for i in 0..5 {
            total.by_fewest[i].0 += p.by_fewest[i].0;
            total.by_fewest[i].1 += p.by_fewest[i].1;
            total.by_fewest[i].2 += p.by_fewest[i].2;
            total.by_fewest[i].3 += p.by_fewest[i].3;
        }
        total.brier_u += p.brier_u;
        total.brier_l += p.brier_l;
        total.n += p.n;
    }
    total
}

pub fn run(md: &mut String, deals: u64, seed: u64, rules: &Rules) {
    let _ = writeln!(md, "# 상대 손패 추정 학습과 보정 검증\n");
    let _ = writeln!(
        md,
        "대전 배치 {}종(전문가·친구 A/B/C, 2인·3인)에서 차례 시작마다 \"보이지 않는 카드 중 랭크 r이 k장 든 상대 손에 있는 비율\"을 셌다. 가중치 = 그 비율 / 랭크 평균.\n",
        LINEUPS.len()
    );
    let (w, held) = learn_weights(deals, seed, rules);
    let _ = writeln!(md, "## 학습된 가중치 (행 = 상대 손패 장수)\n");
    let _ = writeln!(
        md,
        "| 장수 | A | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | J | Q | K | 표본(든 카드) |"
    );
    let _ = writeln!(md, "|---|{}---|", "---|".repeat(13));
    for k in 1..8 {
        let row: Vec<String> = w[k].iter().map(|x| format!("{x:.2}")).collect();
        let total: u64 = held[k].iter().sum();
        let _ = writeln!(
            md,
            "| {}{} | {} | {total} |",
            k,
            if k == 7 { "+" } else { "" },
            row.join(" | ")
        );
    }
    let _ = writeln!(md, "\n```rust\npub const LEARNED: RankWeights = [");
    for row in &w {
        let r: Vec<String> = row.iter().map(|x| format!("{x:.3}")).collect();
        let _ = writeln!(md, "    [{}],", r.join(", "));
    }
    let _ = writeln!(md, "];\n```\n");

    let cal = calibrate((deals / 4).max(1), seed, rules, &w);
    let _ = writeln!(
        md,
        "## 스톱 승률 추정 보정 (다른 딜 {}개 × 배치 {}종, 스톱 가능 상태 {}개)\n\n추정 = 상대 손패 32샘플 중 내가 엄격 최저인 비율. 실제 = 그 순간 스톱했다면 이겼는가. 잘 보정되면 추정과 실제가 같다.\n",
        (deals / 4).max(1),
        LINEUPS.len(),
        cal.n
    );
    let _ = writeln!(
        md,
        "| 추정 구간 | 균일: 수 | 균일: 평균 추정 | 균일: 실제 | 학습: 수 | 학습: 평균 추정 | 학습: 실제 |"
    );
    let _ = writeln!(md, "|---|---|---|---|---|---|---|");
    for i in 0..10 {
        let (su, yu, nu) = cal.bins_u[i];
        let (sl, yl, nl) = cal.bins_l[i];
        let f = |s: f64, n: u64| {
            if n > 0 {
                format!("{:.3}", s / n as f64)
            } else {
                "·".into()
            }
        };
        let _ = writeln!(
            md,
            "| {:.1}–{:.1} | {nu} | {} | {} | {nl} | {} | {} |",
            i as f64 / 10.0,
            (i + 1) as f64 / 10.0,
            f(su, nu),
            f(yu, nu),
            f(sl, nl),
            f(yl, nl)
        );
    }
    let _ = writeln!(
        md,
        "\n- Brier 점수 (낮을수록 좋음): 균일 **{:.4}**, 학습 **{:.4}**\n",
        cal.brier_u / cal.n as f64,
        cal.brier_l / cal.n as f64
    );
    let _ = writeln!(
        md,
        "| 가장 적게 든 상대 | 상태 수 | 균일 평균 추정 | 학습 평균 추정 | 실제 스톱 승률 |"
    );
    let _ = writeln!(md, "|---|---|---|---|---|");
    for (i, (u, l, y, n)) in cal.by_fewest.iter().enumerate() {
        if *n == 0 {
            continue;
        }
        let label = if i == 4 {
            "5장+".to_string()
        } else {
            format!("{}장", i + 1)
        };
        let nf = *n as f64;
        let _ = writeln!(
            md,
            "| {label} | {n} | {:.3} | {:.3} | {:.3} |",
            u / nf,
            l / nf,
            y / nf
        );
    }
    let _ = writeln!(md);
}
