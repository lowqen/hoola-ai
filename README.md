# hoola-ai

[![CI](https://github.com/lowqen/hoola-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/lowqen/hoola-ai/actions/workflows/ci.yml)

한국 카드게임 **훌라**의 규칙 엔진, 최상위 AI, 연습·코칭 환경.

- 계획: [ROADMAP.md](ROADMAP.md)
- 규칙 명세: [RULES.md](RULES.md) · 기본 프리셋 [`config/presets/offline_casual.toml`](config/presets/offline_casual.toml)

## 구조

| 경로 | 내용 |
|---|---|
| `crates/hoola-core` | Rust 규칙 엔진 코어 (카드, 등록·붙이기 판정, 규칙 설정, 게임 상태기계, 결정적 난수) |
| `crates/hoola-core/tests/rules_spec.rs` | RULES.md 명세 테스트 (스톱 판정표, 엣지 케이스 E1–E11, 무작위 대전 불변식) |
| `.github/workflows/ci.yml` | 푸시마다 빌드·테스트·포맷·Clippy 검사 |

빌드와 테스트는 GitHub Actions에서만 실행한다. 로컬에서 돌리려면 `cargo test --workspace`.
