//! 훌라 봇 대전 시뮬레이션.
//!
//! ```text
//! hoola-sim --players 2 --games 10000 --bots greedy,random
//! hoola-sim --players 3 --games 5000 --bots greedy --preset house.toml --no-duplicate
//! ```
//!
//! 듀플리케이트(기본): 같은 딜(시드)마다 봇 배치를 좌석 수만큼 돌려 운 분산을 줄인다.

use std::process::ExitCode;
use std::time::Instant;

use hoola_core::arena::{BOT_NAMES, MatchConfig, run_match};
use hoola_core::preset;

const USAGE: &str = "\
usage: hoola-sim [options]
  --players N       인원 (기본 2)
  --games N         딜 수 (기본 10000). 듀플리케이트면 판 수 = 딜 수 x 인원
  --seed N          시작 시드 (기본 0)
  --bots LIST       쉼표로 구분한 봇 이름 (기본 greedy,random).
                    좌석 수보다 적으면 반복해서 채운다
  --preset PATH     하우스 룰 TOML (기본 offline_casual)
  --no-duplicate    배치를 돌리지 않고 딜마다 한 판만
  -h, --help        도움말";

struct Args {
    players: usize,
    games: u64,
    seed: u64,
    bots: Vec<String>,
    preset: Option<String>,
    duplicate: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        players: 2,
        games: 10_000,
        seed: 0,
        bots: vec!["greedy".into(), "random".into()],
        preset: None,
        duplicate: true,
    };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        let mut value = || it.next().ok_or_else(|| format!("{flag} needs a value"));
        match flag.as_str() {
            "--players" => args.players = parse_num(&value()?)?,
            "--games" => args.games = parse_num(&value()?)?,
            "--seed" => args.seed = parse_num(&value()?)?,
            "--bots" => args.bots = value()?.split(',').map(|s| s.trim().to_string()).collect(),
            "--preset" => args.preset = Some(value()?),
            "--no-duplicate" => args.duplicate = false,
            "-h" | "--help" => return Err(String::new()),
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok(args)
}

fn parse_num<T: std::str::FromStr>(s: &str) -> Result<T, String> {
    s.parse().map_err(|_| format!("not a number: {s}"))
}

fn fail(msg: &str) -> ExitCode {
    if !msg.is_empty() {
        eprintln!("error: {msg}");
    }
    eprintln!("{USAGE}\n  봇: {}", BOT_NAMES.join(", "));
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(msg) => return fail(&msg),
    };
    let loaded = match &args.preset {
        Some(path) => preset::load(path),
        None => Ok(preset::offline_casual()),
    };
    let preset = match loaded {
        Ok(p) => p,
        Err(e) => return fail(&e.to_string()),
    };
    let cfg = MatchConfig {
        rules: preset.rules,
        players: args.players,
        deals: args.games,
        seed: args.seed,
        bots: args.bots,
        duplicate: args.duplicate,
    };
    let start = Instant::now();
    let report = match run_match(&cfg) {
        Ok(r) => r,
        Err(e) => return fail(&e),
    };
    let elapsed = start.elapsed().as_secs_f64();
    let n = cfg.players;

    println!("## hoola-sim");
    println!();
    println!(
        "- 규칙: `{}` · 인원 {n} · 딜 {} · 판 {} · 듀플리케이트 {}",
        preset.name,
        report.deals,
        report.games,
        if cfg.duplicate { "on" } else { "off" }
    );
    println!(
        "- 속도: {:.0} 판/초 ({elapsed:.2}초, 단일 스레드) · 평균 {:.1}턴",
        report.games as f64 / elapsed,
        report.avg_turns
    );
    println!();
    println!("| 봇 | 좌석 수 | 좌석당 승률 | 95% CI | 기준 (1/n) |");
    println!("|---|---|---|---|---|");
    for b in &report.bots {
        println!(
            "| {} | {} | {:.4} | ±{:.4} | {:.4} |",
            b.name,
            b.seats,
            b.mean,
            b.ci95,
            1.0 / n as f64
        );
    }
    println!();
    println!("| 좌석 | 승률 |");
    println!("|---|---|");
    for (s, r) in report.seat_rates.iter().enumerate() {
        println!("| {s} | {r:.4} |");
    }
    println!();
    println!("| 종료 사유 | 비율 |");
    println!("|---|---|");
    for reason in report.reasons.keys() {
        println!("| {reason} | {:.4} |", report.reason_rate(reason));
    }
    ExitCode::SUCCESS
}
