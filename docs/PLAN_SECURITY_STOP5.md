# 계획서: 의존성 보안 자동화 + 1:1 스톱 5점 변형 모드

- 작성: 2026-11-08
- 상태: **진행 중** (2026-11-08 결정 확정, A1 착수). 결정은 맨 아래 "확정된 결정"을 본다.
- 범위: (A) GitHub 의존성·공급망 보안, (B) 2인 판 전용 "스톱 5점 이하" 변형 규칙과 그 공략 연구

---

## A. 의존성·공급망 보안

### A.1 현재 상태 (2026-11-08 조사)

| 항목 | 상태 | 비고 |
|---|---|---|
| 저장소 공개 여부 | 공개 | 공개 저장소라 Dependabot, CodeQL, 의존성 검토(dependency review)를 무료로 쓸 수 있다 |
| Dependabot 알림 | **꺼짐** | API 응답: "Dependabot alerts are disabled" |
| Dependabot 보안 업데이트 | **꺼짐** | `dependabot_security_updates: disabled` |
| `.github/dependabot.yml` | **없음** | 버전 업데이트가 없다 |
| 비밀값 스캔과 푸시 보호 | 켜짐 | 유지 |
| 코드 스캔 (CodeQL) | 없음 | "no analysis found" |
| `main` 브랜치 보호 | 없음 | **`main`에 push하면 곧바로 Pages에 배포된다** |
| 워크플로 기본 토큰 권한 | read | `ci.yml`도 `contents: read`이고, `pages` 잡만 쓰기 권한을 받는다. 양호 |
| **`Cargo.lock`** | **커밋 안 됨** | `.gitignore`에는 없는데 로컬에 cargo가 없어 한 번도 만들어지지 않았다. CI가 매번 최신 semver 버전을 받아서 빌드가 재현되지 않고, Dependabot이 Rust 간접 의존성의 취약점을 추적하지 못한다 |
| `web/package-lock.json` | 커밋됨 | 양호 |
| `npm audit` | low 4건 | `deepmerge`(GHSA-gcqx-w48m-w2h4) ← `@sveltejs/vite-plugin-svelte` ← kit. 빌드 때만 쓰는 개발 의존성이고 배포물에는 들어가지 않는다. `npm audit fix --force`는 kit을 0.0.30으로 **내리는** 잘못된 해결책이므로 쓰지 않는다. 상위 패키지 업데이트를 기다린다 |
| `npm outdated` | 4개 | vite 8.3.6(패치), @playwright/test 1.65(마이너), typescript 7(메이저), @types/node 26(메이저) |
| 액션 버전 고정 | 태그(`@v5` 등) | 서드파티 액션(dtolnay, Swatinem, taiki-e)도 태그로만 고정되어 있다. 태그를 옮기는 공급망 공격에 노출된다 |
| wasm-pack | 버전 미고정 | `taiki-e/install-action`이 항상 최신 버전을 설치한다 |

의존성 생태계는 4개다: Cargo 워크스페이스(`/`), Cargo 단독 크레이트(`crates/hoola-py`, 워크스페이스에서 제외됨), npm(`web/`), GitHub Actions(`.github/workflows`). Python 쪽은 빌드 요구사항(maturin, pytest)뿐이라 우선순위가 낮다.

### A.2 해야 할 일 (우선순위순)

#### A1. `Cargo.lock` 커밋 — 선행 필수
- 로컬에 cargo가 없으므로 CI가 만든 lock 파일을 받아 온다.
  1. `ci.yml`의 `test` 잡과 `python` 잡에서 `Cargo.lock`, `crates/hoola-py/Cargo.lock`을 아티팩트로 올리는 단계를 임시로 추가한다.
  2. `gh run download`로 받아서 커밋한다.
  3. 그다음 CI의 cargo 명령에 `--locked`를 붙여, lock 파일과 맞지 않으면 실패하게 한다.
- 이유: 바이너리(WASM 웹앱, sim, lab)를 배포하는 프로젝트이므로 lock 파일을 커밋하는 것이 Cargo의 권장 방식이다. Dependabot의 cargo 보안 업데이트도 lock 파일이 있어야 간접 의존성까지 잡는다.

#### A2. `.github/dependabot.yml` 추가
초안:

```yaml
version: 2
updates:
  - package-ecosystem: cargo
    directory: /
    schedule: { interval: weekly, day: monday, time: "09:00", timezone: Asia/Seoul }
    cooldown: { default-days: 7 }        # 갓 나온 버전은 7일 뒤에 제안 (공급망 공격 완충)
    groups:
      rust-minor: { update-types: [minor, patch] }
    open-pull-requests-limit: 5
    commit-message: { prefix: "deps(cargo)" }

  - package-ecosystem: cargo
    directory: /crates/hoola-py           # 워크스페이스 밖의 별도 크레이트
    schedule: { interval: weekly, day: monday, time: "09:00", timezone: Asia/Seoul }
    cooldown: { default-days: 7 }
    groups:
      py-minor: { update-types: [minor, patch] }
    commit-message: { prefix: "deps(py)" }

  - package-ecosystem: npm
    directory: /web
    schedule: { interval: weekly, day: monday, time: "09:00", timezone: Asia/Seoul }
    cooldown: { default-days: 7 }
    groups:
      web-minor: { update-types: [minor, patch] }
      svelte: { patterns: ["svelte", "@sveltejs/*", "svelte-check", "prettier-plugin-svelte"] }
    open-pull-requests-limit: 5
    commit-message: { prefix: "deps(web)" }

  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
    groups:
      actions: { patterns: ["*"] }
    commit-message: { prefix: "deps(ci)" }
```

- 마이너와 패치는 묶어서 PR 하나로 받고, 메이저는 따로 받는다. TypeScript 7이나 `@types/node` 26 같은 메이저 업데이트는 PR에서 `npm run check`가 통과하는지 보고 판단한다.
- 보안 업데이트는 위 일정과 상관없이 바로 PR로 온다(A3에서 켠다).

#### A3. 저장소 설정 켜기 (웹 Settings → Code security, 사용자가 직접)
- Dependency graph, Dependabot alerts, Dependabot security updates를 켠다. 지금 gh 토큰에는 관리자 범위가 없으므로 웹에서 켜거나 `gh auth refresh -s admin:repo_hook` 뒤에 API로 켠다.
- Code scanning → CodeQL **기본 설정**을 켠다. 언어는 JavaScript/TypeScript, Actions, Rust.
- Private vulnerability reporting을 켜고, 짧은 `SECURITY.md`를 추가한다. 선택 사항.

#### A4. CI 보안 점검 추가 (`ci.yml`)
| 추가할 것 | 내용 |
|---|---|
| `cargo-deny` 잡 | `EmbarkStudios/cargo-deny-action`으로 RustSec 권고(advisories), 라이선스, 출처를 검사한다. 루트에 `deny.toml`을 둔다. 권고 DB는 매일 바뀌므로 `schedule`(주 1회)로도 돌린다 |
| 의존성 검토 | PR에서만 `actions/dependency-review-action`을 돌려, 새로 들어오는 취약 의존성(high 이상)이 있으면 실패시킨다 |
| `npm audit` | `web` 잡에 `npm audit --audit-level=high`를 추가한다. 지금 있는 low 4건은 통과한다 |
| 액션 SHA 고정 | 서드파티 액션은 커밋 SHA에 버전 주석을 달아 고정한다(`uses: owner/action@<sha> # v2.x`). Dependabot이 SHA와 주석을 함께 갱신한다. `dtolnay/rust-toolchain@stable`은 ref가 툴체인 이름을 겸하므로, SHA로 고정하려면 `with: toolchain: stable`로 바꾼다 |
| wasm-pack 버전 고정 | `tool: wasm-pack@<버전>` |
| checkout 자격 증명 | 모든 `actions/checkout`에 `persist-credentials: false`. 이후 단계에서 git push를 하지 않기 때문이다 |

#### A5. Dependabot PR과 자동 배포의 관계 (정책 결정)
- `ci.yml`은 `push: branches: ["**"]`와 `pull_request`에 모두 걸려 있어서, Dependabot 브랜치에서는 CI가 **두 번** 돈다. `concurrency` 그룹이 ref별이라 서로 취소되지 않는다. → `push` 트리거에 `branches-ignore: ["dependabot/**"]`를 걸어 Dependabot 브랜치는 PR 실행만 남긴다.
- Dependabot PR을 병합하면 **곧바로 Pages에 배포된다**. 그래서 아래처럼 정했다(결정 3, 판단 근거 포함).
  - **자동 병합은 쓰지 않는다.** 몇 주 지켜본 뒤 "패치 + CI 전체 통과"만 자동 병합하는 것을 다시 검토한다.
  - **`main`에 ruleset을 건다.** 필수 상태 체크는 Build & Test, Format & Clippy, Web practice app이다. 강제 push와 브랜치 삭제는 막는다. **저장소 관리자(소유자)는 우회(bypass: always)** 로 둔다.
    - 근거: ruleset을 걸면 Dependabot PR은 CI 3개가 통과해야만 병합 버튼이 열린다. 소유자는 우회 권한이 있어서 지금처럼 `main`에 직접 push할 수 있고, 작업 방식이 바뀌지 않는다. ruleset을 아예 안 걸면 CI가 실패한 Dependabot PR을 실수로 병합해 배포할 수 있다. 우회 없이 강제하면 직접 push가 막혀 작업 흐름이 깨진다. 두 경우 모두 손해가 크다.
    - 우회한 병합에는 화면에 경고가 뜬다. Dependabot PR을 병합할 때는 우회하지 않는 것을 원칙으로 한다.

### A.3 완료 기준
- `Cargo.lock` 2개가 커밋되어 있고, CI가 `--locked`로 통과한다.
- Dependabot이 4개 생태계 모두에서 첫 PR(또는 "최신 상태")을 보고한다. Insights → Dependency graph → Dependabot 탭에서 확인한다.
- Security 탭에 Dependabot 알림과 CodeQL 분석이 나온다.
- `cargo-deny`, dependency review, `npm audit` 단계가 CI에 있고 통과한다.

### A.4 범위 밖 (참고만)
- 웹앱 자체의 보안(CSP 메타 태그, 서비스 워커 캐시 무효화)은 이번 범위가 아니다. 정적 사이트이고 서버나 비밀값이 없어서 위험이 낮다.
- OpenSSF Scorecard 액션은 선택 사항이다. 위 작업을 마치면 점수 대부분을 이미 충족한다.

---

## B. 1:1 스톱 5점 변형 모드

### B.1 요구사항 해석
- 친구 제안: **2인 판(1:1)에서만** 스톱 가능 점수를 10점 이하에서 **5점 이하**로 낮춘다. 3인 이상은 지금처럼 10점 이하다.
- 훌라는 단판이고 판 도중 탈락이 없으므로, "1:1"은 **2인으로 시작한 판**을 뜻한다고 본다(확인할 결정 1번).
- 스톱의 나머지 규칙(받기 전 선언, 등록 무관, 첫 차례 허용, 엄격 최저 판정)은 바꾸지 않는다.
- 기존 규칙(`offline_casual`)은 그대로 두고, **선택할 수 있는 변형**으로 추가한다.

### B.2 왜 연구가 필요한가 (기존 데이터로 본 예상)
- 지금 규칙의 2인 판은 **83%가 스톱 성공으로 끝나는 "스톱 게임"**이다(STRATEGY §4). 실제 친구 모델 E를 상대로 전략서대로 두면 73.3%를 이기는데, 판의 77%가 **내 스톱 성공**으로 끝난다(STRATEGY §6.0). 한도를 5점으로 낮추면 바로 이 무기가 약해진다. 친구가 5점을 제안한 이유도 아마 이것이다.
- **친구 E 모델 수정 (2026-11-08 사용자 확인)**: E는 "3점 이하에서만 스톱"하지 않는다. 자기만의 점수 기준 없이 **규칙상 스톱할 수 있으면 바로 스톱**한다. 그러니 10점 규칙에서는 10점 이하, 5점 변형에서는 5점 이하가 되자마자 스톱한다. 봇 사양은 `expert:stop=t3:meld=dump:outs=1` → `expert:stop=t10:meld=dump:outs=1`로 바꾼다. 봇은 스톱이 합법일 때만 기준을 보므로, 5점 변형에서는 `t10`이 자동으로 "5점 이하면 스톱"이 된다.
  - 영향: STRATEGY §6.0(E 상대 73.3%, 판의 77%가 내 스톱 성공)과 `docs/lab/2026-11-04-friends-model-e.md`는 **잘못된 모델로 잰 수치**다. 10점 규칙에서도 E 상대 결과를 다시 재야 한다(B0 단계).
  - 변형 규칙의 영향도 E 쪽으로 넘어간다. E는 일찍 스톱하는 습관이라 10점 규칙에서는 내 스톱과 자주 부딪혔을 것이다. 5점 변형에서는 E의 스톱도 같이 늦어진다. 누가 더 손해인지는 S7에서 잰다.
- 기존 2인 H8 표에서는 상대가 4장 이상일 때 5점 이하 스톱 승률이 약 1.00이다. 그래서 새 규칙의 스톱 기준표는 "1장 금지, 2장 약 3점, 3장 이상 5점(즉 가능하면 스톱)"처럼 단순해질 가능성이 크다. 다만 이 표는 10점 규칙의 판 흐름에서 나온 것이라 **재측정해야** 한다.
- 예상되는 흐름 변화(모두 실험으로 확인할 가설):
  1. 털기로 끝나는 판이 늘고 판이 길어진다 → 버림, 땡큐, 털기 준비의 비중이 커진다.
  2. **7을 들고 있으면 그것만으로 7점이라 스톱할 수 없다** → 7 단독 즉시 등록이 더 중요해진다.
  3. 낮은 카드(A, 2, 3)를 남겨 두는 가치가 커진다 → "높은 카드부터 버리기"의 세부 기준이 바뀔 수 있다.
  4. 스톱이 드물어지면 등록을 미루는(정보를 숨기는) 전략이 다시 쓸 만해질 수 있다(10점 규칙 H2에서는 즉시 등록이 압도적이었다).
  5. 친구 A형(스톱 안 함, 즉시 등록, 빠른 털기)이 상대적으로 더 강해진다.
  6. 선 이점이 커질 수 있다.

### B.3 엔진 설계

**규칙 키**: `[stop]`에 선택 키 `two_player_limit`을 추가한다(없으면 `limit`를 쓴다).

```toml
# config/presets/heads_up_stop5.toml — offline_casual + 아래 한 줄만 다름
[stop]
limit = 10
two_player_limit = 5     # 2인 판에서만 적용. 생략하면 limit을 쓴다
```

- 인원별 표(`limit_by_players = {2 = 5}`)처럼 일반화하는 방식도 있지만, 요구사항이 2인 하나뿐이라 키 하나로 충분하다. 나중에 필요해지면 그때 일반화한다.
- 2인 전용 프리셋에 `limit = 5`만 적는 방식은 쓰지 않는다. 그 프리셋으로 3인 판을 열면 규칙이 틀려지기 때문이다. `two_player_limit` 방식은 프리셋 하나가 모든 인원에서 맞게 동작한다.

**코드 변경 지점** (이번 조사에서 `stop.limit`을 쓰는 곳을 모두 찾음)

| 파일 | 변경 |
|---|---|
| `crates/hoola-core/src/rules.rs` | `StopRules`에 `two_player_limit: Option<u32>`와 `fn limit_for(players: usize) -> u32`를 추가한다 |
| `crates/hoola-core/src/preset.rs` | `RawStop`에 `#[serde(default)] two_player_limit: Option<u32>`를 추가한다. `deny_unknown_fields`는 유지한다. 파싱 테스트 3개: 키 없음, 키 있음, 잘못된 타입 |
| `crates/hoola-core/src/game.rs:477` | `can_stop`이 `limit_for(players.len())`를 쓰게 한다 |
| `crates/hoola-core/src/expert.rs:416` | `MeldMode::Hold`의 기준을 실제 판 인원의 한도로 바꾼다(관측값에서 인원을 얻는다) |
| `crates/hoola-core/src/observation.rs` | 실제 한도 `stop_limit`을 관측값에 넣는다. WASM과 웹이 이 값만 보면 되게 한다 |
| `crates/hoola-wasm/src/lib.rs:78` | `o.rules.stop.limit` 대신 관측값의 실제 한도를 내보낸다 |
| `crates/hoola-lab/src/main.rs:377`, `friends.rs:251` | 표를 그릴 때 실제 한도를 쓴다 |
| `crates/hoola-lab/src/main.rs` | `--preset PATH` 옵션을 추가한다(hoola-sim에는 이미 있다). 결과 머리말에 프리셋 이름을 출력한다 |
| `crates/hoola-core/tests/rules_spec.rs` | 2인 + 변형: 5점 스톱 가능, 6점 불가. 3인 + 변형: 10점 가능. 변형 없음: 2인 10점 가능 |
| `config/presets/heads_up_stop5.toml` | 새 프리셋 |
| `RULES.md` | §8.3 "변형: 1:1 스톱 5점 [선택]"과 변경 이력(v1.3)을 추가한다. 기본 규칙 본문은 그대로 둔다 |

- 리플레이는 이미 `rules_toml`을 저장하므로(`Replay::new(rules_toml, …)`), 변형 판도 기록과 복원이 그대로 재현된다. 확인용 테스트를 하나 넣는다.
- `belief.rs`의 `LEARNED` 가중치는 10점 규칙의 봇 대전에서 학습한 값이다. 변형 규칙에서는 상대 손패 분포가 달라진다(B.4의 S8).

### B.4 공략 연구 계획 (hoola-lab, 변형 프리셋으로 실행)

실행은 CI 수동 잡으로 한다. `ci.yml`의 `workflow_dispatch` 입력에 `preset`을 추가한다(`offline_casual` | `heads_up_stop5`). 결과는 아티팩트로 받아 `docs/lab/2026-11-xx-stop5-*.md`에 기록한다. 검증은 ROADMAP §2.4 프로토콜을 따른다: 듀플리케이트 매치, 95% 신뢰구간, 2인 기준 50%.

| ID | 질문 | 대응하는 기존 실험 | 판 수(2인) |
|---|---|---|---|
| S1 | 게임 모양: 종료 사유 비율, 평균 턴, 선 이점 | H0 | 셀프플레이 16,000판 |
| S2 | 스톱 승률표(상대 장수 × 내 점수 0~5점)와, 사람이 외울 기준표 후보(`r-,2,4,5`, `r-,3,5`, `r-,-,5`, `t5`, `t3`, `c0.9`) 비교 | H8 → H9 | 표 후보당 16,000판 |
| S3 | 등록 타이밍: now / hold / dump / allin | H2 | 설정당 16,000판 |
| S4 | 7 단독 즉시 등록의 가치 | H3 | 16,000판 |
| S5 | 버림: 높은 카드부터 vs 낮은 카드(A·2·3) 보존, 땡큐 위험 가중치(`danger_weight`), 털기 가능성 가중치(`outs_weight`) | H5·H6 | 설정당 16,000판 |
| S6 | 땡큐: 무조건 vs 선별 | H4 | 16,000판 |
| S7 | **친구 상대**: 수정한 친구 모델 E(`stop=t10`), A, B를 상대로 한 전략서 기준 승률, 그리고 B0에서 다시 잰 10점 규칙 결과와의 차이. 저격용 설정이 따로 필요한지 | F (2인) | 테이블당 66,668판 |
| S8 | 상대 손패 추정(belief) 재학습: 변형 규칙용 `LEARNED` 가중치가 필요한지 | BELIEF, L3 | 실험 설정을 따름 |
| S9 | 전문가 봇 기본값을 변형 규칙에서 다시 조정해야 하는지. 조정한 값이 10점 규칙보다 낫다면 규칙별 기본값을 둘지 결정 | H1 | S2~S6 결과로 판단 |

- 각 실험은 **10점 규칙과 5점 변형을 같은 시드로** 돌려 차이를 직접 비교한다.
- 실행 순서: S1 → S2 → S3·S4·S6 → S5 → S7 → S8·S9. 앞 결과로 기준 봇 설정이 바뀌면 S7은 바뀐 설정으로 돌린다.
- 판정 기준: 채택하는 규칙마다 95% 신뢰구간이 0을 넘어야 한다. 외우기 쉬운 단순 규칙이 최선 대비 0.5%p 이내이면 단순 규칙을 채택한다(기존 전략서와 같은 원칙).

### B.5 웹앱 변경 (web/)

| 파일 | 변경 |
|---|---|
| `play/NewGameSheet.svelte`, `bots.ts`, `store.ts` | 인원이 2일 때만 "1:1 스톱 5점" 스위치를 보여 준다. 설정을 저장하고, 기본값은 꺼짐 |
| `play/session.svelte.ts:243` | 규칙 TOML 덮어쓰기에 `[stop]\ntwo_player_limit = 5`를 추가한다. 지금 `fullDiscards`가 쓰는 방식과 같다 |
| `store.ts` 기록·진행 중인 판 복원(D5) | config에 `stop5`를 추가한다. 예전 저장분은 `false`로 읽는다(마이그레이션 기본값) |
| `play/RulesSheet.svelte` | `STOP_ROWS`와 "10점 이하" 문구를 실제 한도(`obs.stop_limit`)와 모드별 기준표(S2 결과)로 바꾼다 |
| `play/bots.ts:12` | 초보 봇 설명 "10점 이하면 바로 스톱"을 실제 한도에 맞춰 보여 준다 |
| `train/generate.ts` | 스톱 훈련 문제를 모드별로 만든다(선택). 1차에서는 10점 규칙만 두고 변형 모드는 2차로 미룬다 |
| 판 화면 | 변형 모드일 때 "스톱 5점" 표시를 단다(배지나 상단 정보) |
| e2e | 스위치는 2인에서만 보인다 / 6점에서 스톱 버튼 비활성 / 기록 복원 후에도 모드 유지 |

### B.6 문서
- `STRATEGY.md`: "§7 변형: 1:1 스톱 5점"을 새로 쓴다. 한 장 요약, 스톱 기준표, 10점 규칙과 달라지는 점, 친구 상대 결과. 기존 §1~6은 그대로 둔다.
- `TRAINING.md`: 변형 모드 연습 단계를 한 줄 추가한다(선택).
- `ROADMAP.md`: 이 작업을 항목으로 등록한다.

### B.7 단계와 완료 기준

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| B0 친구 E 수정 | E 사양을 `stop=t10`으로 바꾼다: `hoola-lab/src/friends.rs:31`, `web/src/lib/play/bots.ts:9`(설명 문구 포함), `web/src/lib/train/generate.ts:31-32`. 10점 규칙으로 F를 다시 실행해 STRATEGY §6.0을 고친다. 옛 기록(`docs/lab/2026-11-04-friends-model-e.md`)은 지우지 않고 "모델 수정으로 대체됨" 표시와 새 기록 링크를 단다 | CI 통과. §6.0의 수치가 새 기록과 일치한다 |
| B1 엔진 | B.3 전체 + 테스트 | CI의 test, fmt, clippy 통과. rules_spec에 새 케이스 3개 |
| B2 실험 도구 | lab `--preset`, CI 입력 `preset` | `heads_up_stop5`로 H0을 수동 실행해 결과 머리말에 프리셋 이름이 나온다 |
| B3 연구 | S1~S9 | `docs/lab/`에 기록. 신뢰구간 포함 |
| B4 전략서 | STRATEGY §7 | 기준표와 친구 상대 승률이 S2와 S7 수치로 뒷받침된다 |
| B5 웹 | B.5 | `npm run check`, `npm run lint`, e2e 통과. 배포 후 2인에서 직접 확인 |

B1~B2는 웹 변경 없이 먼저 끝낼 수 있다. B5는 S2 결과(모드별 기준표)가 나온 뒤에 하는 것이 효율적이다.

---

## 확정된 결정 (2026-11-08)

1. **"1:1" = 2인으로 시작한 판.**
2. **웹 기본값은 끈다.** 2인일 때만 보이는 선택 스위치로 둔다.
3. **`main` ruleset을 건다. 필수 체크 3개, 소유자는 우회.** 근거는 A5에 적었다.
4. **진행 순서는 A → B0 → B1 …** A는 `security-hardening` 브랜치에서 진행한다(`main`에 push하면 배포되므로). 끝나면 `main`에 합친다.
5. **친구 E 모델을 고친다**: 3점 기준을 없애고, 규칙상 가능하면 바로 스톱한다(`stop=t10`). B0에서 반영한다.

## 진행 기록

- 2026-11-08 A1: CI가 만든 lock 파일을 아티팩트로 받아 `Cargo.lock`(32개 패키지)과 `crates/hoola-py/Cargo.lock`(39개)을 커밋했다. CI의 cargo, maturin, wasm-pack 명령에 `--locked`를 붙였다.
- 2026-11-08 A2: `.github/dependabot.yml`을 추가했다(초안 그대로, svelte 그룹을 마이너 그룹보다 앞에 둠).
- 2026-11-08 A3: API로 Dependabot 알림, 보안 업데이트, 비공개 취약점 신고, CodeQL 기본 설정을 켰다. CodeQL API는 언어 목록에 `rust`를 받지 않아서 언어를 지정하지 않았다. 그러면 감지된 언어를 모두 분석한다. `SECURITY.md`는 아직 쓰지 않았다.
- 2026-11-08 A4: `security.yml`을 추가했다(cargo-deny 2곳, `npm audit --audit-level=high`, PR 의존성 검토, 월요일 09:00 KST 정기 실행). `deny.toml`을 추가했다. 서드파티 액션은 2주 이상 지난 릴리스의 SHA로 고정했다: rust-cache v2.9.3, install-action v2.87.31, cargo-deny-action v2.1.1, rust-toolchain master(2026-10-16). wasm-pack은 지금 CI가 쓰는 0.15.1로 고정했다. 모든 checkout에 `persist-credentials: false`를 넣었다.
- 2026-11-08 A4 첫 성과: cargo-deny가 `pyo3 0.25.1`의 RustSec 권고 2건(RUSTSEC-2026-0176 `PyCFunction::new_closure` Sync 누락, RUSTSEC-2026-0177 `PyList`/`PyTuple` 반복자 범위 밖 읽기)을 잡았다. pyo3를 0.30.1로 올리고, 0.26에서 이름이 바뀐 `py.allow_threads`를 `py.detach`로 고쳤다. CI의 hoola-py clippy, wheel, pytest가 통과했다. `deny.toml`에서 쓰이지 않는 BSD-3-Clause를 뺐다.
- 2026-11-08 A5: `ci.yml`의 push 트리거에서 `dependabot/**`를 뺐다. `main` ruleset "main 보호"(id 26798901)를 만들었다: 필수 체크 3개, 강제 push 금지, 삭제 금지, 관리자 우회.
- 2026-11-08 A 완료: `security-hardening`을 `main`에 fast-forward로 합쳤다(6559ac5). 소유자 우회로 직접 push가 되는 것과 CI·Pages 배포 통과를 확인했다. CodeQL 첫 분석이 성공했다(actions, JS/TS, Python, Rust). Dependabot이 첫 PR 5개를 열었다: #2·#3 toml 0.9→1.1(메이저, #2 CI 실패), #4 typescript 7(메이저, CI 실패), #5 actions 묶음, #6 @types/node 26(메이저). 메이저 PR은 따로 검토한다.
- 2026-11-08 Dependabot 첫 PR 처리:
  - #5 actions 묶음, #6 @types/node 26: CI는 전부 통과했다. 자동 병합 명령은 도구 권한에서 막혀 사용자가 직접 병합한다. #5는 공식 액션을 메이저로 올린다(checkout v7, upload-artifact v7, download-artifact v8, upload-pages-artifact v5, deploy-pages v5 등). Pages 배포 단계는 PR에서 돌지 않으므로 병합 뒤 `main` 배포 결과를 확인해야 한다.
  - #2·#3 toml 1.1: 코드 호환성 문제는 없다. 두 PR 모두 `hoola-core`의 toml을 올리는데 lock 파일을 하나씩만 갱신해서, 반대쪽 lock이 `--locked`에 걸렸다. #2 브랜치에 #3의 `crates/hoola-py/Cargo.lock`을 합쳐 push했다(3dc8306). 이후 #2의 CI가 전부 통과했다. 처음 실패에 섞여 있던 Lighthouse 실패는 재실행에서 통과해 일시적인 것으로 본다. #3은 #2를 병합하면 필요 없어진다. Dependabot이 스스로 닫지 않으면 닫는다.
  - #4 typescript 7: 최신 `svelte-check@4.7.8`의 peer 의존성이 `typescript@^5 || ^6`이라 `npm ci`가 ERESOLVE로 실패한다. 외부 패키지 호환성 문제라 `@dependabot ignore this major version`으로 닫았다. svelte-check가 TypeScript 7을 지원하면 다시 받는다.
  - 교훈: path 의존성을 공유하는 두 Cargo 디렉터리는 Dependabot이 PR을 따로 만든다. 같은 크레이트가 올라가면 lock 두 개를 한 PR로 합쳐야 한다.
- 2026-11-09 B0 완료: 친구 E 사양을 `expert:stop=t10:meld=dump:outs=1`로 바꿨다(3c46206: lab, 웹 봇, 훈련 문제 생성). 10점 규칙으로 F를 다시 잰 결과는 `docs/lab/2026-11-09-friends-model-e-fix.md`에 있다. 2인 E 상대 전략서 71.6%(옛 73.3%), Greedy 70.3%, 나도 버티기 50.6%이고, 기준표가 최선과 0.2%p 이내다. STRATEGY §6.0과 TRAINING 3단계 수치를 고쳤고, 옛 기록에는 대체 표시를 달았다.
  - 발견: 수동 실험(workflow_dispatch)이 같은 concurrency 그룹이라 `main` push 실행을 취소했다. 그래서 3c46206은 배포되지 않았다. 그룹에 이벤트 이름을 넣어 고쳤다.
- 2026-11-09 CI 고속화(44f1926): push 실행 전체가 **9분 40초 → 3분 2초~3분 16초**로 줄었다. Rust job은 캐시 덕에 원래 1분 이내였고, 병목은 웹 job 하나(9분 15초: E2E 4분 46초, Lighthouse 3분 29초)였다.
  - 웹 job을 `wasm`(WASM 빌드·Node 스모크, `wasm-pkg` 아티팩트) → `web-check`(토큰·아이콘·check·lint·빌드, 배포 아티팩트) / `e2e` 2샤드 / `lighthouse` 3샤드(페이지 2개씩, `--collect.url`로 덮어씀) 병렬로 나눴다. 필수 체크 이름 `Web practice app (SvelteKit)`은 `always()`로 도는 게이트 job이 이어받아 ruleset을 바꾸지 않았다.
  - E2E: `play.e2e.ts`의 36개가 한 워커에서 직렬로 돌았다. `fullyParallel: true`로 나눴다(테스트마다 새 컨텍스트에 저장소를 심어 공유 상태가 없다). 복기 테스트 4개의 `loseGame`이 봇 지연 900ms라 테스트당 약 50초를 기다렸다. 기본값 60ms로 바꿨다(로컬에서 4개 통과).
  - 문서(`**/*.md`, `docs/**`)만 바뀐 push는 CI와 보안 점검을 건너뛴다. PR은 필수 체크가 멈추지 않도록 CI를 항상 돌린다.
  - 참고: Pages 배포는 웹 게이트만 기다린다(전부터 그랬다). 705448a는 rustfmt 실패 상태로 배포됐고, 28ab8b9에서 고쳤다.
- 2026-11-09 B1 완료(705448a, 28ab8b9): B.3대로 `StopRules.two_player_limit`과 `limit_for(players)`를 추가했다. `can_stop`, 관측값 `stop_limit`(WASM이 그대로 내보냄), 전문가 봇 `hold` 기준, lab 스톱 표(H8, F3)가 실제 판 인원의 한도를 쓴다. `config/presets/heads_up_stop5.toml`, RULES.md §8.3과 v1.3 변경 이력을 추가했고, `offline_casual.toml`에는 주석으로 키를 안내했다. 테스트: rules_spec 3개(2인 5점 가능·6점 불가, 3인 10점 가능, 변형 없는 2인 10점 가능), 프리셋 파싱(키 없음·있음·잘못된 타입, `heads_up_stop5` 로드), 변형 리플레이 왕복. CI test·fmt·clippy 통과.
  - B2 일부도 했다: lab `--preset PATH`와 결과 머리말의 프리셋 이름. 남은 B2: `ci.yml` 수동 실행 입력 `preset`과 `heads_up_stop5` H0 수동 실행.
  - 웹은 바꾸지 않았다. 웹은 `two_player_limit`을 넣지 않으므로 동작이 같다.
- 2026-11-09 배포 조건 보완과 B2 완료(ef7185e): Pages 배포 job의 `needs`에 `test`(Build & Test)와 `lint`(Format & Clippy)를 넣어, Rust 검사가 실패하면 배포하지 않는다. push CI 전체 통과와 배포를 확인했다.
  - 수동 실행 입력 `preset`(`heads_up_stop5` 기본 | `offline_casual`)을 추가해 `lab-friends`, `lab-search`, 새 `lab-study`에 `--preset config/presets/<preset>.toml`로 넘긴다. 실험 선택지에 `stop5`(S1·S2·S7)를 추가했다. `lab-study`는 2인만 돌며 H0(S1), H8과 S2 후보표(S2)를 한 아티팩트(`study-results`)로 낸다. 10점 비교값은 같은 실행의 `lab` job(같은 시드)에서 얻는다.
  - concurrency 그룹에 실험·프리셋을 넣어 수동 실험끼리도 서로 취소하지 않게 했다.
  - hoola-lab: S2 가설(`--only S2`로만 돈다), F2에 2인 한도가 10보다 낮을 때 5점용 규칙표 후보 4개를 추가했다.
- 2026-11-09 B3 1차(S1·S2·S7): `gh workflow run ci.yml -f experiment=stop5 -f preset=heads_up_stop5`(run 42496991557). 기록은 `docs/lab/2026-11-09-stop5-study.md`.
  - S1: 스톱 성공 82% → 68%, 털기 11% → 27%, 평균 턴 8.7 → 11.0. 선 이점은 커지지 않았다(53.3% → 52.6%, 유의하지 않음).
  - S2: 기준표 **`-,3,5`**(1장 금지, 2장 3점 이하, 3장 이상 가능하면 스톱)가 확률 계산 대비 −0.27%p로 채택 기준을 통과했다. H8 표를 그대로 옮긴 `-,2,5`는 −0.51%p, "가능하면 스톱"(`t5`)은 −1.18%p.
  - S7: 전략서 봇 2인 승률 E 63.6%(10점 71.6%), A 57.9%(60.7%), B 65.6%(74.7%), C 59.7%(63.2%). 친구용 스톱 설정은 필요 없다(`-,3,5`로 충분). 10점에서 손해였던 조각 보존(아웃당 5~8점)이 5점 변형에서는 세 친구 모두에게 +0.7~1.7%p 이득으로 뒤집혔다 → S5를 앞당겨 셀프플레이로 확인한다.
  - 남은 B3: S3·S4·S5·S6·S8·S9. S5 결과로 기준 봇이 바뀌면 S7을 다시 잰다.
