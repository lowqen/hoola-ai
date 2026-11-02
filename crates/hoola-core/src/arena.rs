//! 봇 대전 진행기 (듀플리케이트 지원). `hoola-sim` CLI와 Python 바인딩이 함께 쓴다.

use std::collections::BTreeMap;

use crate::bot::{Bot, GreedyBot, RandomBot, play_out};
use crate::expert::{ExpertBot, ExpertConfig};
use crate::search::{SearchBot, SearchConfig};
use crate::game::{Action, EndReason, Game};
use crate::observation::Observation;
use crate::rules::{FirstPlayer, Rules};

/// 이름으로 고를 수 있는 봇.
#[derive(Debug, Clone)]
pub enum NamedBot {
    Random(RandomBot),
    Greedy(GreedyBot),
    Expert(Box<ExpertBot>),
    Search(Box<SearchBot>),
}

/// 사용 가능한 봇 이름. `expert`는 `expert:stop=c0.6:meld=hold`처럼 설정을 붙일 수 있다
/// ([`ExpertConfig::parse`]).
/// `search`는 `search:k=16`처럼 설정을 붙일 수 있다 ([`SearchConfig::parse`]).
pub const BOT_NAMES: &[&str] = &["random", "greedy", "expert", "search"];

impl NamedBot {
    /// `name`으로 봇을 만든다. `seed`는 무작위성이 있는 봇만 쓴다.
    pub fn new(name: &str, seed: u64) -> Option<NamedBot> {
        match name {
            "random" => Some(NamedBot::Random(RandomBot::new(seed))),
            "greedy" => Some(NamedBot::Greedy(GreedyBot)),
            _ if name.starts_with("search") => {
                let spec = &name["search".len()..];
                let spec = if spec.is_empty() {
                    spec
                } else {
                    spec.strip_prefix(':')?
                };
                let cfg = SearchConfig::parse(spec).ok()?;
                Some(NamedBot::Search(Box::new(SearchBot::new(cfg, seed))))
            }
            _ => {
                let spec = name.strip_prefix("expert")?;
                let spec = if spec.is_empty() {
                    spec
                } else {
                    spec.strip_prefix(':')?
                };
                let cfg = ExpertConfig::parse(spec).ok()?;
                Some(NamedBot::Expert(Box::new(ExpertBot::new(cfg, seed))))
            }
        }
    }
}

impl Bot for NamedBot {
    fn name(&self) -> &str {
        match self {
            NamedBot::Random(b) => b.name(),
            NamedBot::Greedy(b) => b.name(),
            NamedBot::Expert(b) => b.name(),
            NamedBot::Search(b) => b.name(),
        }
    }

    fn act(&mut self, obs: &Observation<'_>, legal: &[Action]) -> Action {
        match self {
            NamedBot::Random(b) => b.act(obs, legal),
            NamedBot::Greedy(b) => b.act(obs, legal),
            NamedBot::Expert(b) => b.act(obs, legal),
            NamedBot::Search(b) => b.act(obs, legal),
        }
    }
}

/// 대전 설정.
#[derive(Debug, Clone)]
pub struct MatchConfig {
    pub rules: Rules,
    pub players: usize,
    /// 딜(시드) 수. 듀플리케이트면 판 수 = 딜 수 × 인원.
    pub deals: u64,
    pub seed: u64,
    /// 봇 이름. 좌석 수보다 적으면 반복해서 채운다 (좌석 s = `bots[s % k]`).
    pub bots: Vec<String>,
    /// 같은 딜마다 배치를 좌석 수만큼 돌린다.
    pub duplicate: bool,
}

/// 봇별 결과.
#[derive(Debug, Clone, PartialEq)]
pub struct BotResult {
    pub name: String,
    /// 한 판에서 이 봇이 앉는 좌석 수.
    pub seats: usize,
    /// 좌석당 평균 보상 (= 승률, 공동 승리는 1/k).
    pub mean: f64,
    /// 정규 근사 95% 신뢰구간 반폭 (딜 단위 표본).
    pub ci95: f64,
}

/// 대전 결과.
#[derive(Debug, Clone, PartialEq)]
pub struct MatchReport {
    pub games: u64,
    pub deals: u64,
    pub avg_turns: f64,
    pub bots: Vec<BotResult>,
    /// 좌석별 평균 보상.
    pub seat_rates: Vec<f64>,
    /// 종료 사유별 판 수 (`out`, `stop-success`, `stop-fail`, `no-cards`, `turn-limit`).
    pub reasons: BTreeMap<String, u64>,
}

impl MatchReport {
    pub fn bot(&self, name: &str) -> Option<&BotResult> {
        self.bots.iter().find(|b| b.name == name)
    }

    pub fn reason_rate(&self, reason: &str) -> f64 {
        self.reasons.get(reason).copied().unwrap_or(0) as f64 / self.games as f64
    }
}

pub fn end_reason_name(reason: EndReason) -> &'static str {
    match reason {
        EndReason::Out { .. } => "out",
        EndReason::Stop { success: true, .. } => "stop-success",
        EndReason::Stop { success: false, .. } => "stop-fail",
        EndReason::NoCards => "no-cards",
        EndReason::TurnLimit => "turn-limit",
    }
}

#[derive(Default)]
struct Acc {
    seats: usize,
    sum: f64,
    sum_sq: f64,
}

/// 대전을 돌린다.
pub fn run_match(cfg: &MatchConfig) -> Result<MatchReport, String> {
    let n = cfg.players;
    cfg.rules.validate(n)?;
    if cfg.bots.is_empty() {
        return Err("no bots".into());
    }
    if cfg.deals == 0 {
        return Err("deals must be positive".into());
    }
    if let Some(bad) = cfg.bots.iter().find(|b| NamedBot::new(b, 0).is_none()) {
        return Err(format!("unknown bot {bad:?} (available: {BOT_NAMES:?})"));
    }
    let lineup: Vec<&str> = (0..n)
        .map(|s| cfg.bots[s % cfg.bots.len()].as_str())
        .collect();
    let rotations = if cfg.duplicate { n } else { 1 };

    let mut acc: BTreeMap<&str, Acc> = BTreeMap::new();
    for &name in &lineup {
        acc.entry(name).or_default().seats += 1;
    }
    let mut reasons: BTreeMap<String, u64> = BTreeMap::new();
    let mut seat_sum = vec![0.0f64; n];
    let mut total_turns = 0u64;
    let mut games = 0u64;

    for deal in 0..cfg.deals {
        let seed = cfg.seed.wrapping_add(deal);
        let first = match cfg.rules.first_player {
            FirstPlayer::Seed => (seed % n as u64) as usize,
            FirstPlayer::Rotate => (deal % n as u64) as usize,
            FirstPlayer::Seat(s) => s,
        };
        let mut deal_sum: BTreeMap<&str, f64> = BTreeMap::new();
        for rot in 0..rotations {
            let seating: Vec<&str> = (0..n).map(|s| lineup[(s + rot) % n]).collect();
            let mut owned: Vec<NamedBot> = seating
                .iter()
                .enumerate()
                .map(|(s, name)| NamedBot::new(name, seed.wrapping_mul(1000) + s as u64).unwrap())
                .collect();
            let mut bots: Vec<&mut dyn Bot> = owned.iter_mut().map(|b| b as &mut dyn Bot).collect();
            let mut game = Game::new(cfg.rules.clone(), n, seed, first)?;
            let outcome = play_out(&mut game, &mut bots);

            games += 1;
            total_turns += u64::from(game.turn());
            *reasons
                .entry(end_reason_name(outcome.reason).to_string())
                .or_default() += 1;
            for (s, &name) in seating.iter().enumerate() {
                seat_sum[s] += outcome.rewards[s];
                *deal_sum.entry(name).or_default() += outcome.rewards[s];
            }
        }
        for (name, a) in acc.iter_mut() {
            let x = deal_sum.get(name).copied().unwrap_or(0.0) / (a.seats * rotations) as f64;
            a.sum += x;
            a.sum_sq += x * x;
        }
    }

    let d = cfg.deals as f64;
    let bots = acc
        .into_iter()
        .map(|(name, a)| {
            let mean = a.sum / d;
            let ci95 = if cfg.deals < 2 {
                f64::NAN
            } else {
                let var = (a.sum_sq - a.sum * a.sum / d) / (d - 1.0);
                1.96 * (var.max(0.0) / d).sqrt()
            };
            BotResult {
                name: name.to_string(),
                seats: a.seats,
                mean,
                ci95,
            }
        })
        .collect();
    Ok(MatchReport {
        games,
        deals: cfg.deals,
        avg_turns: total_turns as f64 / games as f64,
        bots,
        seat_rates: seat_sum.iter().map(|s| s / games as f64).collect(),
        reasons,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(bots: &[&str], players: usize, duplicate: bool) -> MatchConfig {
        MatchConfig {
            rules: Rules::default(),
            players,
            deals: 50,
            seed: 3,
            bots: bots.iter().map(|s| s.to_string()).collect(),
            duplicate,
        }
    }

    #[test]
    fn report_is_consistent() {
        let r = run_match(&cfg(&["greedy", "random"], 3, true)).unwrap();
        assert_eq!(r.games, 150);
        assert_eq!(r.bot("greedy").unwrap().seats, 2);
        assert_eq!(r.bot("random").unwrap().seats, 1);
        let total: f64 = r.seat_rates.iter().sum();
        assert!((total - 1.0).abs() < 1e-9);
        let weighted: f64 = r.bots.iter().map(|b| b.mean * b.seats as f64).sum();
        assert!((weighted - 1.0).abs() < 1e-9);
        assert_eq!(r.reasons.values().sum::<u64>(), r.games);
    }

    #[test]
    fn deterministic() {
        let c = cfg(&["random"], 2, false);
        assert_eq!(run_match(&c).unwrap(), run_match(&c).unwrap());
    }

    #[test]
    fn expert_specs() {
        assert!(NamedBot::new("expert", 0).is_some());
        assert!(NamedBot::new("expert:stop=t5:meld=hold", 0).is_some());
        assert!(NamedBot::new("expert:bogus=1", 0).is_none());
        assert!(NamedBot::new("expertx", 0).is_none());
        assert!(NamedBot::new("search", 0).is_some());
        assert!(NamedBot::new("search:k=4:rollout=stop=t8;outs=2", 0).is_some());
        assert!(NamedBot::new("search:k=0", 0).is_none());
    }

    #[test]
    fn expert_beats_greedy() {
        let mut c = cfg(&["expert", "greedy"], 2, true);
        c.deals = 3000;
        let r = run_match(&c).unwrap();
        let e = r.bot("expert").unwrap();
        assert!(e.mean > 0.5, "expert vs greedy {:.3}", e.mean);
    }

    #[test]
    fn rejects_bad_config() {
        assert!(run_match(&cfg(&["nobody"], 2, true)).is_err());
        assert!(run_match(&cfg(&[], 2, true)).is_err());
        assert!(run_match(&cfg(&["random"], 9, true)).is_err());
    }
}
