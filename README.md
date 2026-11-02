# hoola-ai

[![CI](https://github.com/lowqen/hoola-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/lowqen/hoola-ai/actions/workflows/ci.yml)

한국 카드게임 **훌라**의 규칙 엔진, 최상위 AI, 연습·코칭 환경.

- 계획: [ROADMAP.md](ROADMAP.md)
- 전략서: [STRATEGY.md](STRATEGY.md) (v1.1, 2인·3인 — 스톱 기준표, 친구 상대 분석)
- 규칙 명세: [RULES.md](RULES.md) · 기본 프리셋 [`config/presets/offline_casual.toml`](config/presets/offline_casual.toml)

## 연습장 (웹앱)

브라우저에서 봇·친구 페르소나와 대전하는 연습 환경. 엔진은 WebAssembly로 브라우저 안에서 돈다.

**바로 하기: https://lowqen.github.io/hoola-ai/** (main 푸시마다 CI가 자동 배포)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/practice.ps1   # 오프라인: 최신 CI 빌드를 받아 http://localhost:8765 로 연다
```

- **기본은 셀프 모드**: 등록·붙이기·땡큐·스톱을 스스로 찾아서 한다 (카드를 골라 버튼, 붙이기는 카드 1장 고르고 바닥 조합 클릭). 틀리면 규칙 안내만 나온다
- **초보자 모드**(상단 토글): 가능한 수를 버튼으로 보여 주고, 스톱 기준표 도우미와 L3 힌트를 켠다. 이 모드를 쓴 판은 전적에 "초보"로 따로 집계

- 상대: 전문가(전략서 v1), 친구 A 버티기 / B 한방 / C 늦은 스톱·보류, Greedy, Random
- 오프라인처럼 버림패는 맨 위 1장만 보인다 (설정에서 전체 보기)
- 되돌리기, 같은 패 다시, 판 복기(L3로 확실한 실수만 지적 — 두 모드 모두)
- 전적과 모든 판의 리플레이는 브라우저에 저장되고 JSON으로 내보낼 수 있다

## 구조

| 경로 | 내용 |
|---|---|
| `crates/hoola-core` | Rust 규칙 엔진 코어 (상태기계, 관측 API, 프리셋, 리플레이, 봇 L0–L3, 대전 진행기) |
| `crates/hoola-core/tests/rules_spec.rs` | RULES.md 명세 테스트 (스톱 판정표, 엣지 케이스 E1–E11, 무작위 대전 불변식) |
| `crates/hoola-py` | Python 바인딩 (`import hoola`, maturin · abi3 wheel은 CI 아티팩트) |
| `crates/hoola-lab` | 전략 가설 실험 (P2), 친구 페르소나(`--only F`), L3 헤드룸(`--only L3`). 결과는 CI 아티팩트, 기록은 `docs/lab/`. 무거운 실험은 `gh workflow run ci.yml`로 수동 실행 |
| `crates/hoola-wasm`, `web/` | 연습장: WASM 바인딩과 정적 웹앱 (CI `hoola-web` 아티팩트, Node·Chromium 스모크 테스트) |
| `crates/hoola-sim` | 봇 대전 시뮬레이션 CLI (듀플리케이트, 승률 95% CI, 초당 판 수) |
| `.github/workflows/ci.yml` | 푸시마다 빌드·테스트·포맷·Clippy 검사, 시뮬레이션 벤치마크 (결과는 Actions 실행 요약) |

빌드와 테스트는 GitHub Actions에서만 실행한다. 로컬에서 돌리려면 `cargo test --workspace`, Python 바인딩은 `cd crates/hoola-py && maturin develop`.
