# hoola-ai

한국 카드게임 훌라의 Rust 규칙 엔진, AI, WASM 연습장. 구조는 `README.md`의 "구조" 절을 본다.

## 문서는 필요할 때만 읽는다

- `RULES.md`: 게임 규칙 명세. 엔진 규칙을 바꾸거나 판정이 의심될 때 읽는다.
- `STRATEGY.md`: 봇과 코칭의 전략 기준
- `TRAINING.md`: 입문자 실력 향상 계획과 통과 기준
- `ROADMAP.md`: 계획
- `docs/DESIGN_PLAN.md`: 디자인 개편(M3) 계획
- `docs/lab/`: 전략 실험 기록

규칙을 바꾸면 `crates/hoola-core/tests/rules_spec.rs`와 `config/presets/offline_casual.toml`도 함께 확인한다.

## 빌드와 검증

- 빌드와 테스트는 GitHub Actions에서 실행한다. 결과는 `gh run view`, `gh run watch`로 확인한다.
- 로컬 실행이 필요하면 CI와 같은 명령을 쓴다.
  - `cargo test --workspace --all-targets`
  - `cargo fmt --all --check`
  - `cargo clippy --workspace --all-targets -- -D warnings`
- `web`에서는 `npm run check`, `npm run lint`로 확인한다.
- 무거운 실험은 `gh workflow run ci.yml`로 수동 실행하고, 결과는 CI 아티팩트에서 받는다.

## 주의

- `main`에 push하면 CI가 GitHub Pages에 자동 배포한다.
