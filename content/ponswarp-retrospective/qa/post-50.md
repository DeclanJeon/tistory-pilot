# post-50 QA — `지금 다시 만든다면 무엇을 남기고 무엇을 버릴까`

## Artifact check

- Draft: `content/ponswarp-retrospective/drafts/post-50.txt`
- HTML fragment: `content/ponswarp-retrospective/html/post-50.html`
- QA note: `content/ponswarp-retrospective/qa/post-50.md`
- SVG assets:
  - `content/ponswarp-retrospective/assets/post-50/keep-discard-map.svg`
  - `content/ponswarp-retrospective/assets/post-50/architecture-reset.svg`
  - `content/ponswarp-retrospective/assets/post-50/decision-flow.svg`

## Structure QA

- Follows the established retrospective arc: problem framing, product state, system structure, failure point, design change, retrospective judgment, read evidence.
- Uses the Season 7/post-50 topic directly: what to keep, discard, and reorder if rebuilding PonsWarp now.
- Keeps service-analysis dimensions visible: project structure, technology stack, user flow, system flow, feature structure, operating/billing implications, and product decision changes.

## Tone QA

- Korean prose uses the existing `~합니다` retrospective tone.
- Avoids banned summary phrases such as `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, and avoids overconfident lesson language.
- Frames the final judgment conservatively: it does not claim a future rebuild exists, only reorders priorities from documented evidence.

## Evidence QA

- Grounded in documented local series evidence:
  - `series-plan.md`: post-50 title, four-layer PonsWarp structure, chronology, Season 7 placement.
  - `evidence-index.md`: PonsWarp, pons-core-wasm, ponswarp-signaling-rs, ponswarp-desktop, Cloud Drop/productization commit anchors.
- Uses existing series commit anchors as contextual evidence:
  - `638bc83`, `21dc9ba`, `4650d02` for memory, save-complete handshake, and corruption/stability.
  - `15aef19`, `1b6fb15`, `58e6b89`, `e589cf2`, `7fe0ca1` for Rust/WASM core boundaries.
  - `44fb5ad`, `f1c69cb` for signaling/backend reality.
  - `4847872`, `3628858`, `a004c91`, `212d751`, `8f7299d`, `d88a625` for Cloud Drop, policy rollback, mobile resume, and measurement.
- Does not invent undocumented implementation specifics; rebuild recommendations are framed as retrospective prioritization.

## HTML QA

- `html/post-50.html` is a Tistory-ready fragment, not a full HTML document.
- Uses inline styles consistent with existing posts.
- Embeds all three diagrams as `data:image/svg+xml;base64,...` image sources.
- No markdown fences are present in the HTML.

## Visual QA

- Three SVG diagrams exist as standalone assets and are embedded in the HTML:
  1. `keep-discard-map.svg` — separates what to keep, reduce, and redesign.
  2. `architecture-reset.svg` — maps the retained four-layer product/engine/storage-core/backend structure.
  3. `decision-flow.svg` — orders user, trust, and operation conditions before feature expansion.
- Diagrams are explanatory rather than decorative and match the article's central claims.
- SVG text is Korean/English mixed in the same style as prior assets, with accessible `role="img"` and `aria-label`.

## Publish readiness

Status: **REVISE**

Reason: the article artifacts are complete and internally QA'd, but live Tistory publication has not happened in this task. Per series convention, publish readiness remains REVISE until live publish exists and is checked in the target surface.
