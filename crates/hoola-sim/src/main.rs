//! 훌라 봇 대전 시뮬레이션.
//!
//! ```text
//! hoola-sim --players 2 --games 10000 --bots greedy,random
//! hoola-sim --players 3 --games 5000 --bots greedy --preset house.toml --no-duplicate
//! ```
//!
//! 듀플리케이트(기본): 같은 딜(시드)마다 봇 배치를 좌석 수만큼 돌려 운 분산을 줄인다.

use std::collections::BTreeMap;
use std::process::ExitCode;
use std::time::Instant;

use hoola_core::{Bot, EndReason, FirstPlayer, Game, GreedyBot, RandomBot, Rules, play_out, preset};

const USAGE: &str = "\
usage: hoola-sim [options]
  --players N       인원 (기본 2)
  --games N         딜 수 (기본 10000). 듀플리케이트면 판 수 = 딜 수 x 인원
  --seed N          시작 시드 (기본 0)
  --bots LIST       쉼표로 구분한 봇: random, greedy (기본 greedy,random).
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
    if args.bots.is_empty() || args.bots.iter().any(|b| make_bot(b, 0).is_none()) {
        return Err(format!("unknown bot in {:?}", args.bots));
    }
    Ok(args)
}

fn parse_num<T: std::str::FromStr>(s: &str) -> Result<T, String> {
    s.parse().map_err(|_| format!("not a number: {s}"))
}

fn make_bot(name: &str, seed: u64) -> Option<Box<dyn Bot>> {
    match name {
        "random" => Some(Box::new(RandomBot::new(seed))),
        "greedy" => Some(Box::new(GreedyBot)),
        _ => None,
    }
}

/// 봇별 누적 통계. 단위는 딜: 딜마다 그 봇이 앉은 좌석들의 평균 보상을 한 표본으로 본다.
#[derive(Default)]
struct BotStats {
    seats_per_game: usize,
    sum: f64,
    sum_sq: f64,
    deals: u64,
}

impl BotStats {
    fn add_deal(&mut self, mean_reward: f64) {
        self.sum += mean_reward;
        self.sum_sq += mean_reward * mean_reward;
        self.deals += 1;
    }

    fn mean(&self) -> f64 {
        self.sum / self.deals as f64
    }

    /// 정규 근사 95% 신뢰구간 반폭.
    fn ci95(&self) -> f64 {
        let n = self.deals as f64;
        if n < 2.0 {
            return f64::NAN;
        }
        let var = (self.sum_sq - self.sum * self.sum / n) / (n - 1.0);
        1.96 * (var.max(0.0) / n).sqrt()
    }
}

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(msg) => {
            if !msg.is_empty() {
                eprintln!("error: {msg}");
            }
            eprintln!("{USAGE}");
            return ExitCode::from(2);
        }
    };
    let loaded = match &args.preset {
        Some(path) => preset::load(path),
        None => Ok(preset::offline_casual()),
    };
    let preset = match loaded {
        Ok(p) => p,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::from(2);
        }
    };
    let rules: Rules = preset.rules;
    let n = args.players;
    if let Err(e) = rules.validate(n) {
        eprintln!("error: {e}");
        return ExitCode::from(2);
    }

    // 기본 배치: 좌석 s에 bots[s % k]. 듀플리케이트면 배치를 n번 돌린다.
    let lineup: Vec<&str> = (0..n)
        .map(|s| args.bots[s % args.bots.len()].as_str())
        .collect();
    let rotations = if args.duplicate { n } else { 1 };

    let mut stats: BTreeMap<&str, BotStats> = BTreeMap::new();
    for &name in &lineup {
        stats.entry(name).or_default().seats_per_game += 1;
    }
    let mut reasons: BTreeMap<&str, u64> = BTreeMap::new();
    let mut seat_rewards = vec![0.0f64; n];
    let mut total_turns = 0u64;
    let mut total_games = 0u64;

    let start = Instant::now();
    for deal in 0..args.games {
        let seed = args.seed.wrapping_add(deal);
        let first = match rules.first_player {
            FirstPlayer::Seed => (seed % n as u64) as usize,
            FirstPlayer::Rotate => (deal % n as u64) as usize,
            FirstPlayer::Seat(s) => s,
        };
        let mut deal_sum: BTreeMap<&str, f64> = BTreeMap::new();
        for rot in 0..rotations {
            let seating: Vec<&str> = (0..n).map(|s| lineup[(s + rot) % n]).collect();
            let mut owned: Vec<Box<dyn Bot>> = seating
                .iter()
                .enumerate()
                .map(|(s, name)| make_bot(name, seed.wrapping_mul(1000) + s as u64).unwrap())
                .collect();
            let mut bots: Vec<&mut dyn Bot> = owned.iter_mut().map(|b| b.as_mut()).collect();
            let mut game = Game::new(rules.clone(), n, seed, first).expect("validated");
            let outcome = play_out(&mut game, &mut bots);

            total_games += 1;
            total_turns += u64::from(game.turn());
            let reason = match outcome.reason {
                EndReason::Out { .. } => "out",
                EndReason::Stop { success: true, .. } => "stop-success",
                EndReason::Stop { success: false, .. } => "stop-fail",
                EndReason::NoCards => "no-cards",
                EndReason::TurnLimit => "turn-limit",
            };
            *reasons.entry(reason).or_default() += 1;
            for (s, &name) in seating.iter().enumerate() {
                seat_rewards[s] += outcome.rewards[s];
                *deal_sum.entry(name).or_default() += outcome.rewards[s];
            }
        }
        for (name, st) in stats.iter_mut() {
            let seat_games = (st.seats_per_game * rotations) as f64;
            st.add_deal(deal_sum.get(name).copied().unwrap_or(0.0) / seat_games);
        }
    }
    let elapsed = start.elapsed().as_secs_f64();

    println!("## hoola-sim");
    println!();
    println!(
        "- 규칙: `{}` · 인원 {n} · 딜 {} · 판 {total_games} · 듀플리케이트 {}",
        preset.name,
        args.games,
        if args.duplicate { "on" } else { "off" }
    );
    println!(
        "- 속도: {:.0} 판/초 ({elapsed:.2}초, 단일 스레드) · 평균 {:.1}턴",
        total_games as f64 / elapsed,
        total_turns as f64 / total_games as f64
    );
    println!();
    println!("| 봇 | 좌석 수 | 좌석당 승률 | 95% CI | 기준 (1/n) |");
    println!("|---|---|---|---|---|");
    for (name, st) in &stats {
        println!(
            "| {name} | {} | {:.4} | ±{:.4} | {:.4} |",
            st.seats_per_game,
            st.mean(),
            st.ci95(),
            1.0 / n as f64
        );
    }
    println!();
    println!("| 좌석 | 승률 |");
    println!("|---|---|");
    for (s, r) in seat_rewards.iter().enumerate() {
        println!("| {s} | {:.4} |", r / total_games as f64);
    }
    println!();
    println!("| 종료 사유 | 비율 |");
    println!("|---|---|");
    for (reason, count) in &reasons {
        println!("| {reason} | {:.4} |", *count as f64 / total_games as f64);
    }
    ExitCode::SUCCESS
}
