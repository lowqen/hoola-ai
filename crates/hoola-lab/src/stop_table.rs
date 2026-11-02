//! H8. 스톱 기준표: 전문가 봇 셀프플레이에서 스톱 가능한 순간마다
//! "지금 스톱했다면 이겼는가"를 실제 손패로 판정해 (상대 손패 장수, 내 점수)별로 모은다.

use std::collections::BTreeMap;
use std::fmt::Write as _;

use hoola_core::arena::NamedBot;
use hoola_core::{Action, Bot, Game, Phase, Rules};

#[derive(Debug, Clone, Copy, Default)]
pub struct Cell {
    pub wins: u64,
    pub total: u64,
}

impl Cell {
    fn rate(self) -> f64 {
        self.wins as f64 / self.total as f64
    }
}

/// 키: (상대 손패 장수 오름차순, 내 손패 점수).
pub type Table = BTreeMap<(Vec<usize>, u32), Cell>;

fn collect_range(
    lineup: &[&str],
    target: &str,
    seeds: std::ops::Range<u64>,
    rules: &Rules,
) -> Table {
    let n = lineup.len();
    let mut table = Table::new();
    for seed in seeds {
        let mut g = Game::new(rules.clone(), n, seed, (seed % n as u64) as usize).expect("valid");
        // 딜마다 배치를 돌려 좌석 편향을 없앤다
        let seating: Vec<&str> = (0..n)
            .map(|s| lineup[(s + seed as usize) % n])
            .collect();
        let mut bots: Vec<NamedBot> = seating
            .iter()
            .enumerate()
            .map(|(s, name)| NamedBot::new(name, seed.wrapping_mul(1000) + s as u64).expect("bot"))
            .collect();
        while !g.is_over() {
            let seat = g.current_player();
            let legal = g.legal_actions();
            if seating[seat] == target
                && g.phase() == Phase::TurnStart
                && legal.contains(&Action::Stop)
            {
                let mine = g.hand_points(seat);
                let win = (0..n).all(|s| s == seat || g.hand_points(s) > mine);
                let mut counts: Vec<usize> = (0..n)
                    .filter(|&s| s != seat)
                    .map(|s| g.hand(s).len())
                    .collect();
                counts.sort_unstable();
                let cell = table.entry((counts, mine)).or_default();
                cell.total += 1;
                cell.wins += u64::from(win);
            }
            let action = bots[seat].act(&g.observation(seat), &legal);
            g.apply(action).expect("legal");
        }
    }
    table
}

/// 딜을 스레드로 나눠 모은다. `lineup` 배치로 두면서 `target` 봇의 스톱 기회만 기록한다.
pub fn collect(lineup: &[&str], target: &str, deals: u64, seed: u64, rules: &Rules) -> Table {
    let threads = std::thread::available_parallelism()
        .map(|t| t.get() as u64)
        .unwrap_or(1);
    let chunk = deals.div_ceil(threads);
    let parts: Vec<Table> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..threads)
            .map(|t| {
                let lo = seed + t * chunk;
                let hi = (seed + (t + 1) * chunk).min(seed + deals);
                scope.spawn(move || collect_range(lineup, target, lo..hi.max(lo), rules))
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    let mut table = Table::new();
    for part in parts {
        for (k, c) in part {
            let e = table.entry(k).or_default();
            e.wins += c.wins;
            e.total += c.total;
        }
    }
    table
}

/// 마크다운 표. 표본이 `min_samples`보다 적은 칸은 `·`.
/// `group_min`이면 행을 "가장 적게 든 상대의 장수"로 묶는다 (3인 이상).
pub fn render(table: &Table, limit: u32, min_samples: u64, group_min: bool, md: &mut String) {
    let mut rows: BTreeMap<Vec<usize>, BTreeMap<u32, Cell>> = BTreeMap::new();
    for ((counts, pts), c) in table {
        let key = if group_min {
            vec![counts[0]]
        } else {
            counts.clone()
        };
        let e = rows.entry(key).or_default().entry(*pts).or_default();
        e.wins += c.wins;
        e.total += c.total;
    }
    let header: Vec<String> = (0..=limit).map(|p| format!("{p}점")).collect();
    let _ = writeln!(
        md,
        "| {} | {} | P≥0.9 최대 점수 | P≥0.8 최대 점수 | 표본 |",
        if group_min {
            "가장 적게 든 상대의 장수"
        } else {
            "상대 손패 장수"
        },
        header.join(" | ")
    );
    let _ = writeln!(md, "|---|{}---|---|---|", "---|".repeat(limit as usize + 1));
    for (counts, cells) in &rows {
        let total: u64 = cells.values().map(|c| c.total).sum();
        if total < min_samples * 3 {
            continue;
        }
        let shown: Vec<String> = (0..=limit)
            .map(|p| match cells.get(&p) {
                Some(c) if c.total >= min_samples => format!("{:.2}", c.rate()),
                _ => "·".into(),
            })
            .collect();
        let max_at = |th: f64| {
            (0..=limit)
                .rev()
                .find(|p| {
                    cells
                        .get(p)
                        .is_some_and(|c| c.total >= min_samples && c.rate() >= th)
                })
                .map_or("-".to_string(), |p| p.to_string())
        };
        let label: Vec<String> = counts.iter().map(|c| c.to_string()).collect();
        let _ = writeln!(
            md,
            "| {} | {} | {} | {} | {total} |",
            label.join("·"),
            shown.join(" | "),
            max_at(0.9),
            max_at(0.8)
        );
    }
}
