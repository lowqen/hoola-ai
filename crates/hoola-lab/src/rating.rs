//! 웹 연습장 봇 레이팅 (`--only R`).
//!
//! 시드 고정 교차 대국: 봇 n개를 고른 테이블마다 같은 딜(시드·선)을 좌석 배치만 바꿔 여러 번 둔다.
//! 2인은 자리를 바꿔 2판, 3인 이상은 회전 n가지 × 방향 2가지로 2n판(3인은 모든 순열과 같다).
//! 같은 카드를 모든 봇이 같은 자리에서 한 번씩 받으므로 카드 운이 상쇄된다.
//!
//! 레이팅은 판마다 "둘 중 한쪽만 이긴" 쌍을 1승으로 세어 Bradley–Terry 최대우도로 맞추고
//! 친구모델을 1000에 둔다. 2인에서는 보통의 Elo와 같다. 오차는 딜 구간 잭나이프.

use std::fmt::Write as _;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

use hoola_core::arena::NamedBot;
use hoola_core::{Bot, EndReason, FirstPlayer, Game, Rules, play_out};

/// 웹 봇 (키, 이름, 사양). `web/src/lib/play/bots.ts`와 맞춘다.
pub const WEB_BOTS: &[(&str, &str, &str)] = &[
    ("search", "탐색", "search:k=128"),
    ("expert", "전략서", "expert"),
    ("greedy", "즉시스톱", "greedy"),
    ("friendA", "노스톱", "expert:stop=never:outs=3"),
    ("friendC", "늦은스톱", "expert:stop=t2:meld=hold:outs=3"),
    ("friendE", "친구모델", "expert:stop=t10:meld=dump:outs=1"),
    ("friendB", "한방털기", "expert:stop=never:meld=allin:outs=3"),
];

const ANCHOR: &str = "friendE";
const ANCHOR_RATING: f64 = 1000.0;
/// 잭나이프 딜 구간 수.
const BLOCKS: u64 = 20;

/// 스레드로 나눠 돌린다 (입력 순서 유지).
pub fn par_map<T: Sync, R: Send>(items: &[T], f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
    let next = AtomicUsize::new(0);
    let out: Mutex<Vec<Option<R>>> = Mutex::new((0..items.len()).map(|_| None).collect());
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    let Some(item) = items.get(i) else { break };
                    let r = f(item);
                    out.lock().unwrap()[i] = Some(r);
                }
            });
        }
    });
    out.into_inner()
        .unwrap()
        .into_iter()
        .map(|r| r.expect("job done"))
        .collect()
}

/// 좌석 배치: `arr[s]` = 좌석 s에 앉는 테이블 내 봇 번호.
pub fn arrangements(n: usize) -> Vec<Vec<usize>> {
    if n == 2 {
        return vec![vec![0, 1], vec![1, 0]];
    }
    let mut out = Vec::new();
    for r in 0..n {
        out.push((0..n).map(|s| (s + r) % n).collect());
        out.push((0..n).map(|s| (r + n - s) % n).collect());
    }
    out
}

/// 딜 번호로 정해지는 시드와 선.
pub fn deal_setup(rules: &Rules, n: usize, base_seed: u64, deal: u64) -> (u64, usize) {
    let seed = base_seed.wrapping_add(deal);
    let first = match rules.first_player {
        FirstPlayer::Seed => (seed % n as u64) as usize,
        FirstPlayer::Rotate => (deal % n as u64) as usize,
        FirstPlayer::Seat(s) => s,
    };
    (seed, first)
}

fn zeros(n: usize) -> Vec<Vec<f64>> {
    vec![vec![0.0; n]; n]
}

/// 누적 결과. 행렬은 `[i][j]` = 봇 i 쪽에서 본 봇 j.
#[derive(Clone)]
struct Tally {
    /// `[블록][i][j]`: i만 이기고 j는 못 이긴 판 수.
    wins: Vec<Vec<Vec<f64>>>,
    /// 같은 판에 앉은 횟수와 점수차 합 (j 손패 점수 − i 손패 점수).
    pair_games: Vec<Vec<f64>>,
    margin: Vec<Vec<f64>>,
    /// 딜 단위 쌍 기대점수(단독 우위 1, 동률 0.5)의 합·제곱합·단위 수 (95% CI용).
    sx: Vec<Vec<f64>>,
    sxx: Vec<Vec<f64>>,
    units: Vec<Vec<f64>>,
    /// 봇별: 판 수, 보상 합(승률), 끝난 손패 점수 합, 내 털기, 내 스톱 성공, 내 스톱 실패.
    games: Vec<f64>,
    reward: Vec<f64>,
    hand_pts: Vec<f64>,
    outs: Vec<f64>,
    stop_ok: Vec<f64>,
    stop_fail: Vec<f64>,
    /// 탐색 봇이 앉은 판의 수와 소요 시간 (스레드 시간).
    search_games: f64,
    search_secs: f64,
    total_games: f64,
}

impl Tally {
    fn new(m: usize) -> Tally {
        Tally {
            wins: vec![zeros(m); BLOCKS as usize],
            pair_games: zeros(m),
            margin: zeros(m),
            sx: zeros(m),
            sxx: zeros(m),
            units: zeros(m),
            games: vec![0.0; m],
            reward: vec![0.0; m],
            hand_pts: vec![0.0; m],
            outs: vec![0.0; m],
            stop_ok: vec![0.0; m],
            stop_fail: vec![0.0; m],
            search_games: 0.0,
            search_secs: 0.0,
            total_games: 0.0,
        }
    }

    fn merge(&mut self, o: &Tally) {
        fn add(a: &mut [Vec<f64>], b: &[Vec<f64>]) {
            for (x, y) in a.iter_mut().zip(b) {
                for (p, q) in x.iter_mut().zip(y) {
                    *p += q;
                }
            }
        }
        fn addv(a: &mut [f64], b: &[f64]) {
            for (p, q) in a.iter_mut().zip(b) {
                *p += q;
            }
        }
        for (a, b) in self.wins.iter_mut().zip(&o.wins) {
            add(a, b);
        }
        add(&mut self.pair_games, &o.pair_games);
        add(&mut self.margin, &o.margin);
        add(&mut self.sx, &o.sx);
        add(&mut self.sxx, &o.sxx);
        add(&mut self.units, &o.units);
        addv(&mut self.games, &o.games);
        addv(&mut self.reward, &o.reward);
        addv(&mut self.hand_pts, &o.hand_pts);
        addv(&mut self.outs, &o.outs);
        addv(&mut self.stop_ok, &o.stop_ok);
        addv(&mut self.stop_fail, &o.stop_fail);
        self.search_games += o.search_games;
        self.search_secs += o.search_secs;
        self.total_games += o.total_games;
    }
}

struct Job {
    table: Vec<usize>,
    deals: std::ops::Range<u64>,
}

fn run_job(job: &Job, m: usize, rules: &Rules, seed: u64, total_deals: u64) -> Tally {
    let n = job.table.len();
    let arrs = arrangements(n);
    let has_search = job.table.iter().any(|&b| WEB_BOTS[b].2.starts_with("search"));
    let mut t = Tally::new(m);
    let started = Instant::now();
    for deal in job.deals.clone() {
        let block = (deal * BLOCKS / total_deals.max(1)).min(BLOCKS - 1) as usize;
        let (game_seed, first) = deal_setup(rules, n, seed, deal);
        let mut unit = zeros(m);
        let mut unit_n = zeros(m);
        for arr in &arrs {
            let seating: Vec<usize> = arr.iter().map(|&k| job.table[k]).collect();
            let mut owned: Vec<NamedBot> = seating
                .iter()
                .enumerate()
                .map(|(s, &b)| {
                    NamedBot::new(WEB_BOTS[b].2, game_seed.wrapping_mul(1000) + s as u64)
                        .expect("valid web bot spec")
                })
                .collect();
            let mut bots: Vec<&mut dyn Bot> = owned.iter_mut().map(|b| b as &mut dyn Bot).collect();
            let mut game = Game::new(rules.clone(), n, game_seed, first).expect("valid rules");
            let outcome = play_out(&mut game, &mut bots);
            t.total_games += 1.0;
            let won = |s: usize| outcome.winners.contains(&s);
            for (s, &bi) in seating.iter().enumerate() {
                t.games[bi] += 1.0;
                t.reward[bi] += outcome.rewards[s];
                t.hand_pts[bi] += f64::from(game.hand_points(s));
                match outcome.reason {
                    EndReason::Out { player } if player == s => t.outs[bi] += 1.0,
                    EndReason::Stop { caller, success } if caller == s => {
                        if success {
                            t.stop_ok[bi] += 1.0;
                        } else {
                            t.stop_fail[bi] += 1.0;
                        }
                    }
                    _ => {}
                }
                for (u, &bj) in seating.iter().enumerate() {
                    if u == s {
                        continue;
                    }
                    t.pair_games[bi][bj] += 1.0;
                    t.margin[bi][bj] +=
                        f64::from(game.hand_points(u)) - f64::from(game.hand_points(s));
                    let score = match (won(s), won(u)) {
                        (true, false) => {
                            t.wins[block][bi][bj] += 1.0;
                            1.0
                        }
                        (false, true) => 0.0,
                        _ => 0.5,
                    };
                    unit[bi][bj] += score;
                    unit_n[bi][bj] += 1.0;
                }
            }
        }
        for (i, j) in (0..m).flat_map(|i| (0..m).map(move |j| (i, j))) {
            if unit_n[i][j] > 0.0 {
                let x = unit[i][j] / unit_n[i][j];
                t.sx[i][j] += x;
                t.sxx[i][j] += x * x;
                t.units[i][j] += 1.0;
            }
        }
    }
    if has_search {
        t.search_games += (job.deals.end - job.deals.start) as f64 * arrs.len() as f64;
        t.search_secs += started.elapsed().as_secs_f64();
    }
    t
}

/// Bradley–Terry 최대우도 (MM 반복). `w[i][j]` = i가 j를 이긴 수. 반환: 기준 봇이 1000인 레이팅.
pub fn fit(w: &[Vec<f64>], anchor: usize) -> Vec<f64> {
    let m = w.len();
    let mut p = vec![1.0f64; m];
    for _ in 0..3000 {
        let next: Vec<f64> = (0..m)
            .map(|i| {
                let wins: f64 = w[i].iter().sum();
                let den: f64 = (0..m)
                    .filter(|&j| j != i)
                    .map(|j| (w[i][j] + w[j][i]) / (p[i] + p[j]))
                    .sum();
                if den > 0.0 { wins.max(1e-6) / den } else { p[i] }
            })
            .collect();
        let g = (next.iter().map(|x| x.ln()).sum::<f64>() / m as f64).exp();
        p = next.iter().map(|x| x / g).collect();
    }
    let r: Vec<f64> = p.iter().map(|x| 400.0 * x.log10()).collect();
    let shift = ANCHOR_RATING - r[anchor];
    r.iter().map(|x| x + shift).collect()
}

/// 레이팅 측정 결과를 마크다운으로 쓴다.
pub fn run(
    md: &mut String,
    players: &[usize],
    deals: u64,
    search_deals: u64,
    seed: u64,
    rules: &Rules,
    preset_name: &str,
) {
    let m = WEB_BOTS.len();
    let anchor = WEB_BOTS.iter().position(|b| b.0 == ANCHOR).expect("anchor");
    let _ = writeln!(md, "# 웹 봇 레이팅 (`{preset_name}`)\n");
    let _ = writeln!(
        md,
        "- 시드 고정 교차 대국: 테이블마다 같은 딜을 좌석 배치만 바꿔 둔다 (2인 2판, n인 회전×방향 2n판). 딜 {deals}, 탐색 봇이 낀 테이블은 딜 {search_deals}. 시작 시드 {seed}\n\
         - 레이팅: 판마다 둘 중 한쪽만 이긴 쌍을 1승으로 센 Bradley–Terry 최대우도, 친구모델 = {ANCHOR_RATING:.0}. ±는 딜 구간 잭나이프 95% 반폭\n\
         - 기대점수: 쌍 비교에서 단독 우위 1, 동률(둘 다 승·둘 다 패) 0.5의 평균. 레이팅은 단독 우위만 센다\n\
         - 점수차: 판이 끝났을 때 (상대 손패 점수 − 내 손패 점수)의 평균. 클수록 좋다\n"
    );
    for &n in players {
        if rules.validate(n).is_err() {
            continue;
        }
        let started = Instant::now();
        let mut jobs = Vec::new();
        for table in combinations(m, n) {
            let has_search = table.iter().any(|&b| WEB_BOTS[b].2.starts_with("search"));
            let d = if has_search { search_deals } else { deals };
            let chunk = d.div_ceil(BLOCKS * 2).max(1);
            let mut start = 0;
            while start < d {
                let end = (start + chunk).min(d);
                jobs.push((
                    Job {
                        table: table.clone(),
                        deals: start..end,
                    },
                    d,
                ));
                start = end;
            }
        }
        let parts = par_map(&jobs, |(job, d)| run_job(job, m, rules, seed, *d));
        let mut t = Tally::new(m);
        for p in &parts {
            t.merge(p);
        }
        let total = sum_blocks(&t.wins, None);
        let rating = fit(&total, anchor);
        let jack: Vec<Vec<f64>> = (0..BLOCKS as usize)
            .map(|b| fit(&sum_blocks(&t.wins, Some(b)), anchor))
            .collect();
        let bf = BLOCKS as f64;
        let se: Vec<f64> = (0..m)
            .map(|i| {
                let mean = jack.iter().map(|r| r[i]).sum::<f64>() / bf;
                ((bf - 1.0) / bf * jack.iter().map(|r| (r[i] - mean).powi(2)).sum::<f64>()).sqrt()
            })
            .collect();
        let mut order: Vec<usize> = (0..m).collect();
        order.sort_by(|&a, &b| rating[b].total_cmp(&rating[a]));

        let _ = writeln!(
            md,
            "## {n}인\n\n판 {:.0} · 소요 {:.0}초 · 탐색 봇이 낀 판의 판당 시간 {:.3}초(스레드 기준)\n",
            t.total_games,
            started.elapsed().as_secs_f64(),
            if t.search_games > 0.0 {
                t.search_secs / t.search_games
            } else {
                0.0
            }
        );
        let _ = writeln!(
            md,
            "| 키 | 이름 | 레이팅 | ± | 승률 (공평 {:.1}%) | 기대점수 | 점수차 | 끝 손패 | 털기 | 스톱 성공 | 스톱 실패 |\n|---|---|---|---|---|---|---|---|---|---|---|",
            100.0 / n as f64
        );
        for &i in &order {
            let decisive_w: f64 = (0..m).map(|j| total[i][j]).sum();
            let decisive_n: f64 = (0..m).map(|j| total[i][j] + total[j][i]).sum();
            let pg: f64 = t.pair_games[i].iter().sum();
            let mg: f64 = t.margin[i].iter().sum();
            let g = t.games[i];
            let _ = writeln!(
                md,
                "| `{}` | {} | **{:.0}** | ±{:.0} | {:.1}% | {:.3} | {:+.2} | {:.2} | {:.1}% | {:.1}% | {:.1}% |",
                WEB_BOTS[i].0,
                WEB_BOTS[i].1,
                rating[i],
                1.96 * se[i],
                100.0 * t.reward[i] / g,
                decisive_w / decisive_n,
                mg / pg,
                t.hand_pts[i] / g,
                100.0 * t.outs[i] / g,
                100.0 * t.stop_ok[i] / g,
                100.0 * t.stop_fail[i] / g,
            );
        }
        let _ = writeln!(
            md,
            "\n### {n}인 맞대결 기대점수 (행 봇 기준, 95% CI 반폭)\n"
        );
        let head: Vec<&str> = order.iter().map(|&j| WEB_BOTS[j].1).collect();
        let _ = writeln!(
            md,
            "| | {} |\n|---|{}",
            head.join(" | "),
            "---|".repeat(m)
        );
        for &i in &order {
            let cells: Vec<String> = order
                .iter()
                .map(|&j| {
                    let u = t.units[i][j];
                    if i == j || u < 2.0 {
                        return "·".into();
                    }
                    let mean = t.sx[i][j] / u;
                    let var = (t.sxx[i][j] / u - mean * mean).max(0.0) * u / (u - 1.0);
                    let margin = t.margin[i][j] / t.pair_games[i][j];
                    let ci = 1.96 * (var / u).sqrt();
                    format!("{mean:.3} ±{ci:.3} ({margin:+.1}점)")
                })
                .collect();
            let _ = writeln!(md, "| {} | {} |", WEB_BOTS[i].1, cells.join(" | "));
        }
        let _ = writeln!(md);
        eprintln!(
            "rating {n}p done ({:.0}s)",
            started.elapsed().as_secs_f64()
        );
    }
}

fn sum_blocks(wins: &[Vec<Vec<f64>>], skip: Option<usize>) -> Vec<Vec<f64>> {
    let mut out = zeros(wins[0].len());
    for (b, w) in wins.iter().enumerate() {
        if Some(b) == skip {
            continue;
        }
        for (row, src) in out.iter_mut().zip(w) {
            for (x, y) in row.iter_mut().zip(src) {
                *x += y;
            }
        }
    }
    out
}

/// 0..m에서 k개를 고르는 모든 조합 (사전순).
pub fn combinations(m: usize, k: usize) -> Vec<Vec<usize>> {
    let mut out = Vec::new();
    let mut cur = Vec::with_capacity(k);
    fn go(start: usize, m: usize, k: usize, cur: &mut Vec<usize>, out: &mut Vec<Vec<usize>>) {
        if cur.len() == k {
            out.push(cur.clone());
            return;
        }
        for i in start..m {
            cur.push(i);
            go(i + 1, m, k, cur, out);
            cur.pop();
        }
    }
    go(0, m, k, &mut cur, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arrangements_balance_seats() {
        for n in 2..=5 {
            let arrs = arrangements(n);
            for (s, b) in (0..n).flat_map(|s| (0..n).map(move |b| (s, b))) {
                let hits = arrs.iter().filter(|a| a[s] == b).count();
                assert_eq!(hits * n, arrs.len(), "n={n} seat {s} bot {b}");
            }
        }
        assert_eq!(combinations(7, 3).len(), 35);
    }

    #[test]
    fn fit_recovers_elo_gap() {
        // 0이 1을 76% 이기면 약 200점 차
        let w = vec![vec![0.0, 760.0], vec![240.0, 0.0]];
        let r = fit(&w, 1);
        assert!((r[1] - 1000.0).abs() < 1e-6);
        assert!((r[0] - 1200.0).abs() < 2.0, "{r:?}");
    }
}
