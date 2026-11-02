//! L3 탐색 봇 (ROADMAP §2.3): 결정화 몬테카를로 (PIMC).
//!
//! 내 관측과 맞는 숨은 정보(상대 손패, 더미 순서)를 균일하게 `k`번 샘플링하고, 후보 수마다
//! 같은 샘플들(공통 난수) 위에서 전원을 전문가 봇으로 끝까지 두어 평균 보상을 비교한다.
//!
//! - 탐색하는 결정: 차례 시작(스톱 / 받기 / 땡큐)과 버릴 카드
//! - 등록·붙이기는 전문가 봇 판단을 따른다 (P2에서 즉시 등록이 압도적으로 우세)
//!
//! [`SearchBot::evaluate`]는 후보 수별 승률 추정을 돌려줘 코칭 엔진의 분석기로 쓴다.
//!
//! 사양 문자열: `search` 또는 `search:k=16:rollout=stop=c0.9;outs=3`
//! (`rollout=` 뒤는 롤아웃용 전문가 설정, `;`로 구분)

use crate::bot::Bot;
use crate::card::{Card, CardSet};
use crate::expert::{ExpertBot, ExpertConfig};
use crate::game::{Action, Game, Phase};
use crate::observation::Observation;
use crate::rng::Rng;

/// 탐색 설정.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchConfig {
    /// 결정화 샘플 수.
    pub k: usize,
    /// 롤아웃 정책 (전원).
    pub rollout: ExpertConfig,
    /// 내 결정이 아닌 부분(등록·붙이기)과 탐색 없이 둘 때 쓰는 정책.
    pub base: ExpertConfig,
    /// 스톱도 탐색으로 정한다. 끄면 스톱 여부는 기본 정책(보정된 확률 기준)을 따른다.
    /// 균일 결정화는 상대 점수를 과대평가해 스톱을 과하게 고르는 경향이 있다.
    pub search_stop: bool,
}

impl Default for SearchConfig {
    fn default() -> Self {
        SearchConfig {
            k: 16,
            rollout: ExpertConfig {
                samples: 8,
                ..ExpertConfig::default()
            },
            base: ExpertConfig::default(),
            search_stop: false,
        }
    }
}

impl SearchConfig {
    pub fn parse(spec: &str) -> Result<SearchConfig, String> {
        let mut cfg = SearchConfig::default();
        let mut rest = spec;
        // rollout=...는 끝까지 먹는다
        if let Some(pos) = rest.find("rollout=") {
            let roll = &rest[pos + "rollout=".len()..];
            cfg.rollout = ExpertConfig::parse(&roll.replace(';', ":"))?;
            rest = rest[..pos].trim_end_matches(':');
        }
        for item in rest.split(':').filter(|s| !s.is_empty()) {
            let (key, value) = item
                .split_once('=')
                .ok_or_else(|| format!("expected key=value, got {item:?}"))?;
            match key {
                "k" => {
                    cfg.k = value
                        .parse()
                        .ok()
                        .filter(|&k| k > 0)
                        .ok_or_else(|| format!("bad k: {value:?}"))?
                }
                "stop" => {
                    cfg.search_stop = match value {
                        "1" | "on" | "true" => true,
                        "0" | "off" | "false" => false,
                        _ => return Err(format!("bad stop: {value:?}")),
                    }
                }
                _ => return Err(format!("unknown search option {key:?}")),
            }
        }
        Ok(cfg)
    }
}

/// L3 탐색 봇.
#[derive(Debug, Clone)]
pub struct SearchBot {
    pub cfg: SearchConfig,
    base: ExpertBot,
    rng: Rng,
}

impl SearchBot {
    pub fn new(cfg: SearchConfig, seed: u64) -> SearchBot {
        let base = ExpertBot::new(cfg.base.clone(), seed ^ 0x5EED);
        SearchBot {
            cfg,
            base,
            rng: Rng::seed_from_u64(seed),
        }
    }

    /// 관측과 맞는 판 하나를 샘플링한다.
    fn determinize(&mut self, obs: &Observation<'_>) -> Game {
        let mut pool: Vec<Card> = obs.unseen().iter().collect();
        self.rng.shuffle(&mut pool);
        let mut hands = vec![CardSet::EMPTY; obs.num_players];
        let mut it = pool.into_iter();
        for (s, hand) in hands.iter_mut().enumerate() {
            if s == obs.seat {
                *hand = obs.hand;
            } else {
                *hand = it.by_ref().take(obs.hand_counts[s]).collect();
            }
        }
        let stock: Vec<Card> = it.collect();
        let rng = Rng::seed_from_u64(self.rng.next_u64());
        Game::from_observation(obs, &hands, stock, rng)
    }

    /// 전원을 롤아웃 정책으로 끝까지 둔 뒤 `seat`의 보상.
    fn rollout(&mut self, mut game: Game, seat: usize) -> f64 {
        let seed = self.rng.next_u64();
        let mut bots: Vec<ExpertBot> = (0..game.num_players())
            .map(|s| ExpertBot::new(self.cfg.rollout.clone(), seed.wrapping_add(s as u64)))
            .collect();
        while !game.is_over() {
            let s = game.current_player();
            let legal = game.legal_actions();
            let a = bots[s].act(&game.observation(s), &legal);
            game.apply(a).expect("rollout bot plays legal moves");
        }
        game.outcome().expect("over").rewards[seat]
    }

    /// 탐색 대상 후보. `None`이면 탐색하지 않고 기본 정책(`default`)을 따른다.
    fn candidates(
        &self,
        obs: &Observation<'_>,
        legal: &[Action],
        default: Action,
    ) -> Option<Vec<Action>> {
        let cands: Vec<Action> = match obs.phase {
            Phase::TurnStart if self.cfg.search_stop => legal.to_vec(),
            Phase::TurnStart => {
                if default == Action::Stop {
                    return None;
                }
                legal
                    .iter()
                    .copied()
                    .filter(|&a| a != Action::Stop)
                    .collect()
            }
            Phase::MeldPhase => {
                let melding = legal
                    .iter()
                    .any(|a| matches!(a, Action::Register { .. } | Action::Attach { .. }));
                if melding {
                    return None;
                }
                legal.to_vec()
            }
            Phase::Over => return None,
        };
        (cands.len() >= 2).then_some(cands)
    }

    /// 후보 수별 롤아웃 보상 표본 (`[수][샘플]`, 같은 샘플 번호는 같은 결정화).
    fn sample_values(&mut self, obs: &Observation<'_>, legal: &[Action]) -> Vec<Vec<f64>> {
        let mut values = vec![Vec::with_capacity(self.cfg.k); legal.len()];
        for _ in 0..self.cfg.k {
            let world = self.determinize(obs);
            for (i, &a) in legal.iter().enumerate() {
                let mut g = world.clone();
                g.apply(a).expect("legal in every determinization");
                values[i].push(self.rollout(g, obs.seat));
            }
        }
        values
    }

    /// 후보 수별 추정 승률과 표준오차. 지금 차례가 `obs.seat`여야 한다.
    /// `legal` 전체를 평가한다 (등록·붙이기 포함). 코칭 분석기용.
    pub fn evaluate(&mut self, obs: &Observation<'_>, legal: &[Action]) -> Vec<ActionValue> {
        let values = self.sample_values(obs, legal);
        legal
            .iter()
            .zip(&values)
            .map(|(&action, v)| {
                let (value, stderr) = mean_se(v);
                ActionValue {
                    action,
                    value,
                    stderr,
                }
            })
            .collect()
    }
}

/// 수 하나의 평가.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ActionValue {
    pub action: Action,
    /// 추정 승률 (보상 기댓값).
    pub value: f64,
    /// 표준오차.
    pub stderr: f64,
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

impl Bot for SearchBot {
    fn name(&self) -> &str {
        "L3-search"
    }

    /// 기본 정책의 수를 쓰되, 같은 결정화 위에서 짝지어 비교한 차이가
    /// 표준오차의 2배를 넘는 더 좋은 수가 있을 때만 바꾼다 (노이즈로 수를 바꾸지 않도록).
    fn act(&mut self, obs: &Observation<'_>, legal: &[Action]) -> Action {
        let default = self.base.act(obs, legal);
        let Some(cands) = self.candidates(obs, legal, default) else {
            return default;
        };
        let Some(d) = cands.iter().position(|&a| a == default) else {
            return default;
        };
        let values = self.sample_values(obs, &cands);
        let mut best: Option<(f64, usize)> = None;
        for (i, v) in values.iter().enumerate() {
            if i == d {
                continue;
            }
            let diffs: Vec<f64> = v.iter().zip(&values[d]).map(|(a, b)| a - b).collect();
            let (gain, se) = mean_se(&diffs);
            if gain > 2.0 * se && best.is_none_or(|(g, _)| gain > g) {
                best = Some((gain, i));
            }
        }
        best.map_or(default, |(_, i)| cands[i])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::Rules;

    #[test]
    fn parse_spec() {
        let c = SearchConfig::parse("k=4:rollout=stop=t8;outs=2").unwrap();
        assert_eq!(c.k, 4);
        assert_eq!(c.rollout.outs_weight, 2.0);
        assert_eq!(SearchConfig::parse("").unwrap(), SearchConfig::default());
        assert!(SearchConfig::parse("k=0").is_err());
        assert!(SearchConfig::parse("depth=3").is_err());
        assert!(SearchConfig::parse("stop=1").unwrap().search_stop);
    }

    #[test]
    fn determinization_matches_observation() {
        let mut g = Game::new(Rules::default(), 3, 4, 0).unwrap();
        g.apply(Action::Draw).unwrap();
        let mut bot = SearchBot::new(SearchConfig::default(), 1);
        let obs = g.observation(0);
        for _ in 0..20 {
            let d = bot.determinize(&obs);
            assert_eq!(d.observation(0), obs);
            for s in 0..3 {
                assert_eq!(d.hand(s).len(), g.hand(s).len());
            }
            assert_eq!(d.stock_len(), g.stock_len());
        }
    }

    #[test]
    fn evaluate_scores_every_action() {
        let g = Game::new(Rules::default(), 2, 9, 0).unwrap();
        let mut bot = SearchBot::new(
            SearchConfig {
                k: 2,
                ..SearchConfig::default()
            },
            3,
        );
        let legal = g.legal_actions();
        let scores = bot.evaluate(&g.observation(0), &legal);
        assert_eq!(scores.len(), legal.len());
        assert!(scores.iter().all(|v| (0.0..=1.0).contains(&v.value)));
        assert!(scores.iter().all(|v| v.stderr >= 0.0));
    }
}
