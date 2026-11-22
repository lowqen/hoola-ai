# Security

## Reporting a vulnerability

Please report privately, not in a public issue:
**[Report a vulnerability](https://github.com/lowqen/hoola-ai/security/advisories/new)**
(GitHub's private vulnerability reporting; only the maintainer sees it).

Say what is affected, how to reproduce it, and what an attacker gains. This is a
one-person project, so replies are best effort; a fix for anything real is
deployed with the next push to `main`, and you are credited in the commit
unless you would rather not be.

## Supported versions

Only the current `main`, which is what
[lowqen.github.io/hoola-ai](https://lowqen.github.io/hoola-ai/) serves. An installed
app picks up a new version once all its tabs are closed and it is opened online again.

## What is in scope

The practice app has no account, no server of its own and no payments. Games,
records and replays stay in the browser's local storage. What matters:

* **The deploy path.** Anything that could change what GitHub Pages serves
  without the maintainer: this repository's settings, its GitHub Actions
  workflows and the actions they pin.
* **Dependencies.** A vulnerable crate or npm package that ships in the app or
  runs in CI. Dependabot and CodeQL watch these; a report is still welcome if
  you find something they miss.
* **The app itself.** Script injection through anything the app renders, or a
  crash of the engine (WebAssembly) from a state the rules allow.

Not in scope: an attacker who already controls your browser or device, and
results of experiments (`hoola-lab`, `hoola-sim`) run on your own machine with
inputs you chose.

---

## 한국어 요약

* **취약점 제보는 공개 이슈가 아니라 [비공개 제보](https://github.com/lowqen/hoola-ai/security/advisories/new)로.**
  무엇이 영향을 받는지, 재현 방법, 공격자가 얻는 것을 적어 주세요. 1인 프로젝트라 답은 최선을 다하는 수준이고,
  실제 문제는 다음 `main` 배포에서 고칩니다.
* **지원 버전**은 GitHub Pages에 배포된 현재 `main` 하나입니다.
* **중요하게 보는 것**: 배포 경로(저장소 설정 · GitHub Actions), 앱과 CI에 들어가는 의존성,
  앱이 그리는 내용을 통한 스크립트 주입, 규칙상 가능한 상태에서 엔진이 죽는 경우.
* **범위 밖**: 이미 브라우저나 기기를 장악한 공격자, 직접 고른 입력으로 내 컴퓨터에서 돌린 실험 결과.
