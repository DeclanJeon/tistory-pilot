# Post 37 QA — readiness, cleanup, production env가 중요해진 시점

## Artifact check

- Draft: `content/ponswarp-retrospective/drafts/post-37.txt`
- HTML fragment: `content/ponswarp-retrospective/html/post-37.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-37/readiness-boundary.svg`
  - `content/ponswarp-retrospective/assets/post-37/cleanup-state.svg`
  - `content/ponswarp-retrospective/assets/post-37/production-env-flow.svg`

## Structure QA

- Follows the established series shape: problem framing, 당시 제품 상태, system structure, failure point, design change, product/operation interpretation, retrospective judgment, evidence list.
- Includes service-analysis elements: project structure, technical stack, user flow, system flow, operational/deployment perspective, feature structure, product judgment change.
- Stays scoped to post-37 and does not update manifests or other posts.

## Tone QA

- Korean prose uses the established reflective `~합니다` tone.
- Avoids banned summary phrases from `series-plan.md` such as `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, and overclaiming lesson language.
- Keeps the article human and retrospective rather than generic AI-summary style.

## Evidence QA

- Claims are grounded in existing series planning/evidence materials:
  - `series-plan.md` Season 4 post map and Core/backend layer entries (`/health`, `/ready`, `/ws`, auth, billing, state).
  - `evidence-index.md` Rust signaling and productization commits: `44fb5ad`, `b834716`, `f1c69cb`, `58cec5b`, `d88a625`.
  - Earlier series references to production logging, STUN/TURN, readiness, cleanup, and production measurement.
- No invented implementation specifics beyond the documented responsibilities and commit messages.
- Uses the cleanup deadlock commit as a product-state interpretation, not as an unverified code-level root-cause reconstruction.

## HTML QA

- `post-37.html` is a Tistory-ready fragment, not a full HTML document.
- Uses inline styles consistent with previous posts.
- Embeds all three SVG visuals as base64 `data:image/svg+xml;base64,...` URIs.
- Includes accessible `alt` text and figure captions.
- Contains no markdown fences.

## Visual QA

- Three SVG source assets exist under `assets/post-37/`.
- Visuals are explanatory, not decorative:
  - readiness boundary from health/process liveness to product readiness,
  - cleanup state from live room to stale/deadlock risk to cleanup criteria,
  - production env from local assumptions to production product conditions.
- Diagrams use restrained editorial colors and readable labels aligned with earlier asset style.

## Publish readiness

REVISE until live publish exists. The article artifacts are prepared for review and Tistory staging, but publish readiness remains REVISE because no live Tistory publication URL or post-publish visual validation exists.
