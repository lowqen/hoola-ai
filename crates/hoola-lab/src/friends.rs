//! 친구 페르소나 실험 (F)과 L3 탐색 헤드룸 측정 (L3).

use std::fmt::Write as _;
use std::time::Instant;

use hoola_core::Rules;
use hoola_core::arena::{MatchConfig, MatchReport};

use crate::{run_all, stop_table};

/// 친구 페르소나 (이름, 사양).
pub const FRIENDS: &[(&str, &str, &str)] = &[
    (
        "A",
        "버티기: 스톱 안 함, 조합은 즉시 등록",
        "expert:stop=never",
    ),
    (
        "B",
        "한방: 스톱 안 함, 한 번에 털 수 있을 때만 등록",
        "expert:stop=never:meld=allin",
    ),
    (
        "C",
        "늦은 스톱·보류: 2점 이하에서만 스톱, 털기·스톱 가능할 때까지 등록 보류",
        "expert:stop=t2:meld=hold",
    ),
    (
        "D",
        "순수 한방: 스톱·땡큐 안 함, 한 번에 털 수 있을 때만 전부 등록",
        "expert:stop=never:meld=allin:ty=0",
    ),
];

fn spec(id: &str) -> &'static str {
    FRIENDS.iter().find(|f| f.0 == id).expect("friend id").2
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

/// 같은 대전을 시드 구간으로 나눠 병렬로 돌린 뒤 `bot`의 결과를 합친다 (평균, 95% CI).
fn split_run(base: &MatchConfig, parts: u64) -> Vec<MatchReport> {
    let per = base.deals.div_ceil(parts);
    let configs = (0..parts)
        .map(|p| MatchConfig {
            deals: per,
            seed: base.seed + p * per,
            ..base.clone()
        })
        .collect();
    run_all(configs)
}

fn merged(reports: &[MatchReport], bot: &str) -> (f64, f64) {
    let k = reports.len() as f64;
    let mean = reports
        .iter()
        .map(|r| r.bot(bot).unwrap().mean)
        .sum::<f64>()
        / k;
    let ci = reports
        .iter()
        .map(|r| r.bot(bot).unwrap().ci95.powi(2))
        .sum::<f64>()
        .sqrt()
        / k;
    (mean, ci)
}

fn merged_rate(reports: &[MatchReport], reason: &str) -> f64 {
    let games: u64 = reports.iter().map(|r| r.games).sum();
    let hits: u64 = reports
        .iter()
        .map(|r| r.reasons.get(reason).copied().unwrap_or(0))
        .sum();
    hits as f64 / games as f64
}

fn merged_turns(reports: &[MatchReport]) -> f64 {
    let games: u64 = reports.iter().map(|r| r.games).sum();
    reports
        .iter()
        .map(|r| r.avg_turns * r.games as f64)
        .sum::<f64>()
        / games as f64
}

/// F: [나, 친구...] 2인·3인.
pub fn friends(md: &mut String, deals: u64, seed: u64, rules: &Rules) {
    let started = Instant::now();
    let _ = writeln!(md, "# 친구 페르소나 실험 (2인·3인)\n");
    let _ = writeln!(
        md,
        "- 친구 봇은 전문가 봇과 같은 버림·땡큐 실력을 갖고, 스톱과 등록 습관만 다르다\n- 듀플리케이트: 같은 딜에서 자리를 인원 수만큼 돌린다. 공평한 몫은 2인 50%, 3인 33.3%\n"
    );
    let _ = writeln!(md, "| 친구 | 성향 | 사양 |\n|---|---|---|");
    for (id, desc, s) in FRIENDS {
        let _ = writeln!(md, "| {id} | {desc} | `{s}` |");
    }
    let _ = writeln!(md);

    // F1: 전략서 v1(expert)과 Greedy로 친구 테이블 상대
    let tables: Vec<(&str, Vec<&str>)> = vec![
        ("2인 · A", vec!["A"]),
        ("2인 · B", vec!["B"]),
        ("2인 · C", vec!["C"]),
        ("2인 · D", vec!["D"]),
        ("A·A", vec!["A", "A"]),
        ("B·B", vec!["B", "B"]),
        ("C·C", vec!["C", "C"]),
        ("A·B", vec!["A", "B"]),
        ("A·C", vec!["A", "C"]),
        ("B·C", vec!["B", "C"]),
    ];
    let me_bots = [("전략서 v1 (expert)", "expert"), ("Greedy", "greedy")];
    let _ = writeln!(
        md,
        "## F1. 친구 상대 승률\n\n딜 {deals}개 × 자리 회전 (2인 테이블당 {}판, 3인 {}판)\n",
        deals * 2,
        deals * 3
    );
    let _ = writeln!(
        md,
        "| 나 | 친구 테이블 | 내 승률 | 95% CI | 공평한 몫 | 친구 승률 | 평균 턴 | 털기 | 스톱 성공 | 스톱 실패 |"
    );
    let _ = writeln!(md, "|---|---|---|---|---|---|---|---|---|---|");
    for (me_label, me) in me_bots {
        for (tname, ids) in &tables {
            let mut bots = vec![me.to_string()];
            bots.extend(ids.iter().map(|id| spec(id).to_string()));
            let reports = split_run(&cfg(bots, deals, seed, rules), 8);
            let (mean, ci) = merged(&reports, me);
            let friend_rates: Vec<String> = ids
                .iter()
                .map(|id| {
                    let (m, _) = merged(&reports, spec(id));
                    // 같은 친구가 2명이면 좌석당 값
                    format!("{id} {:.1}%", m * 100.0)
                })
                .collect();
            let _ = writeln!(
                md,
                "| {me_label} | {tname} | **{:.1}%** | ±{:.1}%p | {:.0}% | {} | {:.1} | {:.1}% | {:.1}% | {:.1}% |",
                mean * 100.0,
                ci * 100.0,
                100.0 / (ids.len() + 1) as f64,
                friend_rates.join(" / "),
                merged_turns(&reports),
                merged_rate(&reports, "out") * 100.0,
                merged_rate(&reports, "stop-success") * 100.0,
                merged_rate(&reports, "stop-fail") * 100.0,
            );
        }
    }
    eprintln!("F1 done ({:.0}s)", started.elapsed().as_secs_f64());

    // F2: 친구 저격용 스톱 기준 탐색 (A·B 테이블, B·B 테이블)
    let mut stop_specs: Vec<(String, String)> = Vec::new();
    for t in [10, 9, 8, 7, 6, 5, 4, 3] {
        stop_specs.push((
            format!("점수 ≤ {t}이면 즉시 스톱"),
            format!("expert:stop=t{t}"),
        ));
    }
    for c in ["0.5", "0.7", "0.8", "0.9", "0.95"] {
        stop_specs.push((format!("승리 확률 ≥ {c}"), format!("expert:stop=c{c}")));
    }
    stop_specs.push((
        "전략서 v1 규칙표 -,4,8,10".into(),
        "expert:stop=r-,4,8,10".into(),
    ));
    stop_specs.push(("규칙표 -,6,10,10".into(), "expert:stop=r-,6,10".into()));
    stop_specs.push(("규칙표 2,6,10,10".into(), "expert:stop=r2,6,10".into()));
    stop_specs.push(("규칙표 4,8,10,10".into(), "expert:stop=r4,8,10".into()));
    stop_specs.push((
        "스톱 안 함 (나도 버티기)".into(),
        "expert:stop=never".into(),
    ));
    stop_specs.push(("(버림) 조각 보존 아웃당 5점".into(), "expert:outs=5".into()));
    stop_specs.push(("(버림) 조각 보존 아웃당 8점".into(), "expert:outs=8".into()));
    stop_specs.push(("(버림) 땡큐 위험 회피 1".into(), "expert:danger=1".into()));
    stop_specs.push(("(버림) 땡큐 위험 회피 3".into(), "expert:danger=3".into()));
    let sweep_deals = (deals / 3).max(1);
    let _ = writeln!(
        md,
        "\n## F2. 친구 저격용 스톱 기준\n\n나머지 설정은 전략서 v1과 같고 스톱 기준만 바꾼다. 딜 {sweep_deals}개 × 3회전\n"
    );
    let sweep_tables: Vec<(&str, Vec<&str>)> = vec![
        ("2인 · B", vec!["B"]),
        ("2인 · D", vec!["D"]),
        ("2인 · A", vec!["A"]),
        ("A·B", vec!["A", "B"]),
    ];
    for (tname, ids) in &sweep_tables {
        let configs: Vec<MatchConfig> = stop_specs
            .iter()
            .map(|(_, s)| {
                let mut bots = vec![s.clone()];
                bots.extend(ids.iter().map(|id| spec(id).to_string()));
                cfg(bots, sweep_deals, seed + 7_000_000, rules)
            })
            .collect();
        let reports = run_all(configs);
        let best = reports
            .iter()
            .zip(&stop_specs)
            .map(|(r, (_, s))| r.bot(s).unwrap().mean)
            .fold(f64::NEG_INFINITY, f64::max);
        let _ = writeln!(
            md,
            "### 친구 테이블 {tname}\n\n| 스톱 기준 | 내 승률 | 95% CI | 평균 턴 | 털기 | 스톱 성공 | 스톱 실패 |\n|---|---|---|---|---|---|---|"
        );
        for (r, (label, s)) in reports.iter().zip(&stop_specs) {
            let x = r.bot(s).unwrap();
            let mark = if (x.mean - best).abs() < 1e-12 {
                " ★"
            } else {
                ""
            };
            let _ = writeln!(
                md,
                "| {label}{mark} | {:.1}% | ±{:.1}%p | {:.1} | {:.1}% | {:.1}% | {:.1}% |",
                x.mean * 100.0,
                x.ci95 * 100.0,
                r.avg_turns,
                r.reason_rate("out") * 100.0,
                r.reason_rate("stop-success") * 100.0,
                r.reason_rate("stop-fail") * 100.0,
            );
        }
        let _ = writeln!(md);
    }
    eprintln!("F2 done ({:.0}s)", started.elapsed().as_secs_f64());

    // F3: 친구 상대 실측 스톱 승률표
    let _ = writeln!(
        md,
        "## F3. 친구 상대 실측 스톱 승률표 (A·B 테이블)\n\n전략서 v1 봇이 스톱할 수 있었던 순간마다 \"지금 스톱했다면 이겼는가\"를 실제 손패로 판정. 행 = 가장 적게 든 친구의 장수\n"
    );
    let lineup = ["expert", spec("A"), spec("B")];
    let table = stop_table::collect(&lineup, "expert", deals, seed + 9_000_000, rules);
    stop_table::render(&table, rules.stop.limit, 200, true, md);
    let _ = writeln!(md);
    eprintln!("F3 done ({:.0}s)", started.elapsed().as_secs_f64());
}

/// L3: 탐색 봇이 전문가 봇보다 얼마나 강한가 (헤드룸 측정).
pub fn search_probe(md: &mut String, deals: u64, seed: u64, rules: &Rules) {
    let started = Instant::now();
    let _ = writeln!(md, "# L3 탐색 봇 헤드룸 측정\n");
    let _ = writeln!(
        md,
        "- L3 = 결정화 몬테카를로(PIMC): 숨은 정보 k개 샘플 × 후보 수마다 전원 전문가 봇 롤아웃. 전문가 봇의 수를 기본으로 두고, 같은 샘플로 짝지은 차이가 표준오차 2배를 넘을 때만 바꾼다\n- 판정: 2인에서 +3%p 이상이면 딥러닝(P3) 가치 있음, +1~2%p 이하면 P4·P5 우선\n"
    );
    let _ = writeln!(
        md,
        "| 인원 | 대전 | 설정 | 딜 | L3 승률 | 95% CI | 기준 대비 | 판당 시간 |\n|---|---|---|---|---|---|---|---|"
    );
    let probes: Vec<(usize, &str, u64)> = vec![
        (2, "search:k=128", deals),
        (2, "search:k=128:stop=1", deals),
        (2, "search:k=128:stop=1:belief=uniform", deals),
        (3, "search:k=128", (deals / 2).max(1)),
        (3, "search:k=128:stop=1", (deals / 2).max(1)),
    ];
    for (n, search, d) in probes {
        let mut bots = vec![search.to_string()];
        bots.extend(std::iter::repeat_n("expert".to_string(), n - 1));
        let t0 = Instant::now();
        let reports = split_run(&cfg(bots, d, seed + 3_000_000, rules), 16);
        let secs = t0.elapsed().as_secs_f64();
        let games: u64 = reports.iter().map(|r| r.games).sum();
        let threads = std::thread::available_parallelism().map_or(1, |t| t.get()) as f64;
        let (mean, ci) = merged(&reports, search);
        let base = 1.0 / n as f64;
        let _ = writeln!(
            md,
            "| {n} | L3 vs expert ×{} | {} | {d} | **{:.2}%** | ±{:.2}%p | {:+.2}%p | {:.2}초 |",
            n - 1,
            search.trim_start_matches("search:"),
            mean * 100.0,
            ci * 100.0,
            (mean - base) * 100.0,
            secs * threads / games as f64,
        );
        eprintln!(
            "L3 {n}p {search} done ({:.0}s)",
            started.elapsed().as_secs_f64()
        );
    }
    let _ = writeln!(md);
}
