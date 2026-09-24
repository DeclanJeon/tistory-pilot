# Public output audit — 2026-06-24

## Scope
- Verified the original first live retrospective batch at `https://acstory.tistory.com/873` through `https://acstory.tistory.com/902`
- Verified the emergency repair path against live posts `873` through `877`
- Verified the manage-post list for pages 1 and 2 under `https://acstory.tistory.com/manage/posts/`

## Verified public batch
- Live posts present for retrospective orders 01-30
- Oldest first-batch link: `https://acstory.tistory.com/873`
- Newest first-batch link: `https://acstory.tistory.com/902`

## Repair progress
- Repaired and re-verified `post-01` through `post-30`
- Public titles now follow the required prefix format:
  - `[PonsWarp] - 왜 나는 계속 파일 전송 프로젝트를 만들었나`
  - `[PonsWarp] - 브라우저 앱인데 왜 코어가 Rust인가`
- Public bodies now render full HTML sections and embedded data-URI SVG diagrams on `873` through `902`
- Browser-based verification was required because text-reader snapshots can lag behind the live public page after edit saves
- Repair path hardened on 2026-06-24:
  - existing-post repair now bypasses the unstable generic update flow for emergency title/body recovery
  - HTML body files are injected as raw fragments instead of passing through the generic body builder
  - quick repair saves reopen the edit page and verify title/body lengths before succeeding

## Remaining problems
- Representative image control is still not exposed in the existing-post edit modal, so the current repair path fixes title/body first and leaves thumbnail control as a follow-up problem
- Home topic and thumbnail metadata are still pending writeback on the already-published 01-30 range
- `post-31` through `post-50` still need scheduled public publish execution after the daily limit window reopens
- `post-46` through `post-50` are now present in the manager list as **private drafts** after the new private-fallback path was applied.
- Public scheduled publish still fails in the publish modal; the modal remains open after clicking `공개 발행`, while switching visibility to `비공개` closes the modal and saves successfully.
- Current confirmed private-draft titles:
  - `[PonsWarp] - PayPal, entitlement, checkout flow가 더 어려웠던 이유`
  - `[PonsWarp] - free plan rollback에서 드러난 판단`
  - `[PonsWarp] - analytics를 붙이고 나서야 보인 것들`
  - `[PonsWarp] - PonsWarp가 PonsLink 계열로 이어진 방식`
  - `[PonsWarp] - 지금 다시 만든다면 무엇을 남기고 무엇을 버릴까`

## Representative evidence
- `https://acstory.tistory.com/873`
  - verified in headless browser with updated title prefix
  - first visible section heading: `🧭 같은 문제로 계속 돌아왔습니다`
  - multiple embedded SVG images rendered
- `https://acstory.tistory.com/874`
  - verified in headless browser with updated title prefix
  - first visible section heading: `🧭 이름부터 이미 제품 쪽으로 기울어 있었습니다`
- `https://acstory.tistory.com/877`
  - verified in manager edit page with title/body lengths matching the source HTML fragment

## Source files
- `content/ponswarp-retrospective/publish-results/live-links-snapshot-2026-06-23.json`
- `content/ponswarp-retrospective/qa/live-publish-audit-2026-06-23.md`
- `content/ponswarp-retrospective/qa/repair-work-order-2026-06-24.md`
- `content/ponswarp-retrospective/publish-results/repair-manifest-01-30.json`
- `scripts/repair-ponswarp-retrospective.mjs`