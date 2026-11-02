//! P2 전략 가설 실험.
//!
//! 각 가설마다 후보 설정을 기준 전문가 봇(`expert` 기본값)과 듀플리케이트로 대전시킨다.
//! 2인은 [후보, 기준], 3인은 [후보, 기준, 기준]. 후보의 좌석당 승률이 기준 몫(1/n)보다 높으면
//! 그 설정이 기준보다 낫다.
//!
//! ```text
//! hoola-lab --deals 4000 --out lab-results.md
//! hoola-lab --only H1 --deals 1000
//! ```

mod stop_table;

use std::fmt::Write as _;
use std::time::Instant;

use hoola_core::arena::{MatchConfig, MatchReport, run_match};
use hoola_core::{ExpertConfig, FirstPlayer, Rules};

const BASE: &str = "expert";

struct Hypothesis {
    id: &'static str,
    title: &'static str,
    question: &'static str,
    candidates: Vec<(String, String)>,
}

fn hypotheses() -> Vec<Hypothesis> {
    let c = |label: &str, spec: &str| (label.to_string(), spec.to_string());
    let mut stop = Vec::new();
    for t in 0..=10 {
        stop.push(c(
            &format!("점수 ≤ {t}이면 스톱"),
            &format!("expert:stop=t{t}"),
        ));
    }
    for p in [
        "0.5", "0.6", "0.7", "0.8", "0.85", "0.9", "0.95", "0.98", "1",
    ] {
        stop.push(c(
            &format!("승리 확률 ≥ {p}이면 스톱"),
            &format!("expert:stop=c{p}"),
        ));
    }
    vec![
        Hypothesis {
            id: "H1",
            title: "스톱 기준",
            question: "언제 스톱해야 하나? 고정 점수 기준 vs 추정 승리 확률 기준",
            candidates: stop,
        },
        Hypothesis {
            id: "H2",
            title: "등록 타이밍",
            question: "조합이 생기면 바로 등록할까, 털기·스톱이 가능해질 때까지 보류할까?",
            candidates: vec![
                c("즉시 등록", "expert:meld=now"),
                c("보류", "expert:meld=hold"),
            ],
        },
        Hypothesis {
            id: "H3",
            title: "7 단독 등록",
            question: "7 한 장을 단독으로 등록할까, 손에 들고 조합을 노릴까?",
            candidates: vec![
                c("7 단독 등록", "expert:seven=1"),
                c("7 단독 등록 안 함 (털기 직전 제외)", "expert:seven=0"),
            ],
        },
        Hypothesis {
            id: "H4",
            title: "땡큐",
            question: "땡큐할 수 있으면 항상 할까?",
            candidates: vec![
                c("항상 땡큐", "expert:ty=1"),
                c("땡큐 안 함", "expert:ty=0"),
            ],
        },
        Hypothesis {
            id: "H5",
            title: "버림 위험 (다음 사람 땡큐)",
            question: "다음 사람이 땡큐할 수 있는 카드를 피해 버리는 게 얼마나 중요한가?",
            candidates: vec![
                c("위험 무시", "expert:danger=0"),
                c("가중치 0.25", "expert:danger=0.25"),
                c("가중치 0.5", "expert:danger=0.5"),
                c("가중치 1", "expert:danger=1"),
                c("가중치 2", "expert:danger=2"),
            ],
        },
        Hypothesis {
            id: "H6",
            title: "조각 보존 (아웃 가치)",
            question: "점수가 높아도 조합 직전 카드(페어·연속)를 남길 가치가 있나?",
            candidates: vec![
                c("아웃 무시 (점수만)", "expert:outs=0"),
                c("아웃당 1.5점", "expert:outs=1.5"),
                c("아웃당 3점", "expert:outs=3"),
                c("아웃당 5점", "expert:outs=5"),
                c("아웃당 8점", "expert:outs=8"),
            ],
        },
        Hypothesis {
            id: "H7",
            title: "스톱 판단 샘플 수",
            question: "상대 손패를 몇 번 샘플링해야 스톱 판단이 충분히 정확한가?",
            candidates: vec![
                c("16", "expert:samples=16"),
                c("32", "expert:samples=32"),
                c("64", "expert:samples=64"),
                c("128", "expert:samples=128"),
            ],
        },
    ]
}

struct Args {
    deals: u64,
    seed: u64,
    out: Option<String>,
    only: Option<String>,
    players: Vec<usize>,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        deals: 8000,
        seed: 1_000_000,
        out: None,
        only: None,
        players: vec![2, 3],
    };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        let mut value = || it.next().ok_or_else(|| format!("{flag} needs a value"));
        match flag.as_str() {
            "--deals" => a.deals = value()?.parse().map_err(|_| "bad --deals")?,
            "--seed" => a.seed = value()?.parse().map_err(|_| "bad --seed")?,
            "--out" => a.out = Some(value()?),
            "--only" => a.only = Some(value()?),
            "--players" => {
                a.players = value()?
                    .split(',')
                    .map(|s| s.parse().map_err(|_| "bad --players"))
                    .collect::<Result<_, _>>()?
            }
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok(a)
}

fn cfg(players: usize, bots: Vec<String>, deals: u64, seed: u64, rules: &Rules) -> MatchConfig {
    MatchConfig {
        rules: rules.clone(),
        players,
        deals,
        seed,
        bots,
        duplicate: true,
    }
}

/// 여러 대전을 스레드로 나눠 돌린다 (입력 순서 유지).
fn run_all(configs: Vec<MatchConfig>) -> Vec<MatchReport> {
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let mut results: Vec<Option<MatchReport>> = vec![None; configs.len()];
    let next = std::sync::atomic::AtomicUsize::new(0);
    let slots = std::sync::Mutex::new(&mut results);
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                loop {
                    let i = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let Some(c) = configs.get(i) else { break };
                    let r = run_match(c).expect("valid config");
                    slots.lock().unwrap()[i] = Some(r);
                }
            });
        }
    });
    results.into_iter().map(|r| r.unwrap()).collect()
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(2);
        }
    };
    let rules = Rules::default();
    let started = Instant::now();
    let mut md = String::new();
    let _ = writeln!(md, "# hoola-lab 결과\n");
    let _ = writeln!(
        md,
        "- 규칙: `offline_casual` · 딜 {} (듀플리케이트, 2인 판 수 = 딜 × 2, 3인 = 딜 × 3) · 시작 시드 {}",
        args.deals, args.seed
    );
    let _ = writeln!(
        md,
        "- 기준 봇: `{BASE}` (기본 설정). 2인 [후보, 기준], 3인 [후보, 기준, 기준]"
    );
    let _ = writeln!(
        md,
        "- 표의 승률은 후보의 좌석당 승률. 2인 기준 0.5000, 3인 기준 0.3333보다 높으면 기준보다 강함. CI는 95% 신뢰구간 반폭\n"
    );

    // H0: 봇 사다리 + 기준 봇 셀프플레이 통계 + 선 이점
    let mut ladder = Vec::new();
    for &n in &args.players {
        for (a, b) in [
            ("expert", "greedy"),
            ("expert", "random"),
            ("greedy", "random"),
        ] {
            let mut bots = vec![a.to_string()];
            bots.extend(std::iter::repeat_n(b.to_string(), n - 1));
            ladder.push((n, a, b, cfg(n, bots, args.deals, args.seed, &rules)));
        }
    }
    let mut seat_rules = rules.clone();
    seat_rules.first_player = FirstPlayer::Seat(0);
    let selfplay: Vec<(usize, MatchConfig)> = args
        .players
        .iter()
        .map(|&n| {
            let mut c = cfg(n, vec![BASE.into()], args.deals * 2, args.seed, &seat_rules);
            c.duplicate = false;
            (n, c)
        })
        .collect();

    let run_h0 = args.only.as_deref().is_none_or(|o| o == "H0");
    if run_h0 {
        let reports = run_all(ladder.iter().map(|x| x.3.clone()).collect());
        let _ = writeln!(md, "## H0. 봇 사다리\n");
        let _ = writeln!(md, "| 인원 | 봇 | 상대 | 좌석당 승률 | 95% CI |");
        let _ = writeln!(md, "|---|---|---|---|---|");
        for ((n, a, b, _), r) in ladder.iter().zip(&reports) {
            let x = r.bot(a).unwrap();
            let _ = writeln!(md, "| {n} | {a} | {b} | {:.4} | ±{:.4} |", x.mean, x.ci95);
        }
        let reports = run_all(selfplay.iter().map(|x| x.1.clone()).collect());
        let _ = writeln!(
            md,
            "\n### 기준 봇 셀프플레이 (선 = 0번 고정)\n\n| 인원 | 평균 턴 | 좌석별 승률 (0번 = 선) | 털기 | 스톱 성공 | 스톱 실패 | 기타 |"
        );
        let _ = writeln!(md, "|---|---|---|---|---|---|---|");
        for ((n, _), r) in selfplay.iter().zip(&reports) {
            let seats: Vec<String> = r.seat_rates.iter().map(|x| format!("{x:.3}")).collect();
            let other = r.reason_rate("no-cards") + r.reason_rate("turn-limit");
            let _ = writeln!(
                md,
                "| {n} | {:.1} | {} | {:.3} | {:.3} | {:.3} | {:.4} |",
                r.avg_turns,
                seats.join(" / "),
                r.reason_rate("out"),
                r.reason_rate("stop-success"),
                r.reason_rate("stop-fail"),
                other
            );
        }
        let _ = writeln!(md);
    }

    for h in hypotheses() {
        if args.only.as_deref().is_some_and(|o| o != h.id) {
            continue;
        }
        let mut jobs = Vec::new();
        for &n in &args.players {
            for (label, spec) in &h.candidates {
                let mut bots = vec![spec.clone()];
                bots.extend(std::iter::repeat_n(BASE.to_string(), n - 1));
                jobs.push((
                    n,
                    label.clone(),
                    spec.clone(),
                    cfg(n, bots, args.deals, args.seed, &rules),
                ));
            }
        }
        let reports = run_all(jobs.iter().map(|j| j.3.clone()).collect());
        let _ = writeln!(md, "## {}. {}\n\n{}\n", h.id, h.title, h.question);
        let _ = writeln!(
            md,
            "| 인원 | 후보 | 사양 | 좌석당 승률 | 95% CI | 기준 대비 | 평균 턴 | 털기 | 스톱 성공 | 스톱 실패 |"
        );
        let _ = writeln!(md, "|---|---|---|---|---|---|---|---|---|---|");
        for ((n, label, spec, _), r) in jobs.iter().zip(&reports) {
            let x = r.bot(spec).unwrap();
            let base = 1.0 / *n as f64;
            let is_base = spec
                .strip_prefix("expert:")
                .and_then(|s| ExpertConfig::parse(s).ok())
                .is_some_and(|c| c == ExpertConfig::default());
            let label = if is_base {
                format!("{label} **(기준)**")
            } else {
                label.clone()
            };
            let sig = if is_base || (x.mean - base).abs() < 1e-9 {
                ""
            } else if x.mean - x.ci95 > base {
                " ▲"
            } else if x.mean + x.ci95 < base {
                " ▼"
            } else {
                ""
            };
            let _ = writeln!(
                md,
                "| {n} | {label} | `{spec}` | {:.4} | ±{:.4} | {:+.4}{sig} | {:.1} | {:.3} | {:.3} | {:.3} |",
                x.mean,
                x.ci95,
                x.mean - base,
                r.avg_turns,
                r.reason_rate("out"),
                r.reason_rate("stop-success"),
                r.reason_rate("stop-fail"),
            );
        }
        let _ = writeln!(md);
        eprintln!("{} done ({:.0}s)", h.id, started.elapsed().as_secs_f64());
    }
    if args.only.as_deref().is_none_or(|o| o == "H8") {
        let _ = writeln!(
            md,
            "## H8. 스톱 기준표 (실측)\n\n기준 봇 셀프플레이에서 스톱 가능한 순간마다 \"지금 스톱했다면 이겼는가\"를 실제 손패로 판정한 비율. \
             행 = 상대들의 손패 장수, 열 = 내 손패 점수. 표본 200 미만 칸은 `·`. 상대 스톱으로 판이 먼저 끝나는 경우는 들어 있지 않다.\n"
        );
        for &n in &args.players {
            let table = stop_table::collect(n, args.deals * 3, args.seed, &rules);
            let _ = writeln!(md, "### {n}인\n");
            stop_table::render(&table, rules.stop.limit, 200, n > 2, &mut md);
            let _ = writeln!(md);
        }
        eprintln!("H8 done ({:.0}s)", started.elapsed().as_secs_f64());
    }
    let _ = writeln!(
        md,
        "▲/▼: 95% 신뢰구간이 기준 몫(1/n)을 넘음/밑돎. 총 소요 {:.0}초",
        started.elapsed().as_secs_f64()
    );

    print!("{md}");
    if let Some(path) = &args.out {
        std::fs::write(path, &md).expect("write --out");
    }
}
