//! 결정적 난수 생성기.
//!
//! 외부 크레이트 버전이 바뀌어도 같은 시드가 항상 같은 카드 순서를 내도록
//! 알고리즘(SplitMix64 시딩 + xoshiro256**)을 직접 고정해 둔다.
//! 듀플리케이트 대전과 리플레이 재현성이 이 성질에 의존한다.

/// xoshiro256** 난수 생성기.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rng {
    s: [u64; 4],
}

impl Rng {
    pub fn seed_from_u64(seed: u64) -> Rng {
        let mut state = seed;
        let mut s = [0u64; 4];
        for slot in &mut s {
            *slot = splitmix64(&mut state);
        }
        Rng { s }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    /// `[0, bound)` 구간의 균일한 정수 (Lemire 방식, 편향 없음).
    pub fn below(&mut self, bound: u64) -> u64 {
        assert!(bound > 0, "bound must be positive");
        let threshold = bound.wrapping_neg() % bound;
        loop {
            let m = u128::from(self.next_u64()) * u128::from(bound);
            if (m as u64) >= threshold {
                return (m >> 64) as u64;
            }
        }
    }

    /// Fisher–Yates 셔플.
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i as u64 + 1) as usize;
            items.swap(i, j);
        }
    }
}

fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[cfg(test)]
mod tests {
    use crate::card::{Card, CardSet};

    use super::*;

    #[test]
    fn splitmix64_known_answer() {
        let mut state = 0u64;
        assert_eq!(splitmix64(&mut state), 0xE220_A839_7B1D_CDAF);
    }

    #[test]
    fn same_seed_same_sequence() {
        let mut a = Rng::seed_from_u64(42);
        let mut b = Rng::seed_from_u64(42);
        let mut c = Rng::seed_from_u64(43);
        let xs: Vec<u64> = (0..16).map(|_| a.next_u64()).collect();
        let ys: Vec<u64> = (0..16).map(|_| b.next_u64()).collect();
        let zs: Vec<u64> = (0..16).map(|_| c.next_u64()).collect();
        assert_eq!(xs, ys);
        assert_ne!(xs, zs);
    }

    #[test]
    fn below_stays_in_range_and_hits_every_value() {
        let mut rng = Rng::seed_from_u64(7);
        let mut seen = [false; 13];
        for _ in 0..10_000 {
            let v = rng.below(13);
            assert!(v < 13);
            seen[v as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }

    #[test]
    fn shuffle_is_a_deterministic_permutation() {
        let deck: Vec<Card> = Card::all().collect();
        let mut a = deck.clone();
        let mut b = deck.clone();
        Rng::seed_from_u64(2026).shuffle(&mut a);
        Rng::seed_from_u64(2026).shuffle(&mut b);
        assert_eq!(a, b);
        assert_ne!(a, deck);
        let set: CardSet = a.iter().copied().collect();
        assert_eq!(set, CardSet::FULL);
    }

    #[test]
    fn shuffle_is_roughly_uniform() {
        // 첫 자리에 오는 카드 분포가 크게 치우치지 않는지 (느슨한 검사)
        let mut rng = Rng::seed_from_u64(1);
        let mut counts = [0u32; 52];
        let trials = 52_000;
        for _ in 0..trials {
            let mut deck: Vec<Card> = Card::all().collect();
            rng.shuffle(&mut deck);
            counts[deck[0].index() as usize] += 1;
        }
        for &n in &counts {
            assert!((700..1300).contains(&n), "skewed count {n}");
        }
    }
}
