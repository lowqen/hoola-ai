# web-next — 연습장 새 버전 (SvelteKit + Material 3)

계획: [`../docs/DESIGN_PLAN.md`](../docs/DESIGN_PLAN.md) · 미리보기: https://lowqen.github.io/hoola-ai/next/

| 명령                              | 내용                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                     | 개발 서버 (엔진은 `static/pkg/`에 있어야 한다)                 |
| `npm run check`                   | 타입 검사 (svelte-check)                                       |
| `npm run lint` / `npm run format` | Prettier 검사 / 정리                                           |
| `npm run build`                   | 정적 빌드 → `build/` (`BASE_PATH=/hoola-ai/next`면 Pages 경로) |
| `npx playwright test`             | E2E (빌드 후 preview에서)                                      |
| `npx @lhci/cli autorun`           | Lighthouse (모바일, 3회 중앙값)                                |

엔진 준비: CI는 `wasm-pack build crates/hoola-wasm --target web --out-dir ../../web-next/static/pkg`로 만든다.
로컬에서는 최신 CI 아티팩트 `hoola-web`의 `pkg/`를 `static/pkg/`에 복사해도 된다.

구조

- `src/lib/engine.ts` — 엔진 로더(메인 스레드), 워커 호출
- `src/lib/engine.worker.ts` — 무거운 계산 전용 워커
- `src/lib/ui/` — M3 컴포넌트 키트
- `src/lib/game/` — 게임 컴포넌트(카드·좌석·더미·조합·손패·장면), 카드 모션, 끌기
- `src/routes/` — 화면 (모두 프리렌더). `/motion` 모션 데모, `/gallery` 컴포넌트, `/theme` 테마
