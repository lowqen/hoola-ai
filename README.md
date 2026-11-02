# hoola-ai

[![CI](https://github.com/lowqen/hoola-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/lowqen/hoola-ai/actions/workflows/ci.yml)

한국 카드게임 **훌라**의 규칙 엔진, 최상위 AI, 연습·코칭 환경.

- 계획: [ROADMAP.md](ROADMAP.md)
- 전략서: [STRATEGY.md](STRATEGY.md) (v1.1, 2인·3인 — 스톱 기준표, 친구 상대 분석)
- 규칙 명세: [RULES.md](RULES.md) · 기본 프리셋 [`config/presets/offline_casual.toml`](config/presets/offline_casual.toml)

## 구조

| 경로 | 내용 |
|---|---|
| `crates/hoola-core` | Rust 규칙 엔진 코어 (상태기계, 관측 API, 프리셋, 리플레이, 봇 L0–L3, 대전 진행기) |
| `crates/hoola-core/tests/rules_spec.rs` | RULES.md 명세 테스트 (스톱 판정표, 엣지 케이스 E1–E11, 무작위 대전 불변식) |
| `crates/hoola-py` | Python 바인딩 (`import hoola`, maturin · abi3 wheel은 CI 아티팩트) |
| `crates/hoola-lab` | 전략 가설 실험 (P2), 친구 페르소나(`--only F`), L3 헤드룸(`--only L3`). 결과는 CI 아티팩트, 기록은 `docs/lab/`. 무거운 실험은 `gh workflow run ci.yml`로 수동 실행 |
| `crates/hoola-sim` | 봇 대전 시뮬레이션 CLI (듀플리케이트, 승률 95% CI, 초당 판 수) |
| `.github/workflows/ci.yml` | 푸시마다 빌드·테스트·포맷·Clippy 검사, 시뮬레이션 벤치마크 (결과는 Actions 실행 요약) |

빌드와 테스트는 GitHub Actions에서만 실행한다. 로컬에서 돌리려면 `cargo test --workspace`, Python 바인딩은 `cd crates/hoola-py && maturin develop`.
