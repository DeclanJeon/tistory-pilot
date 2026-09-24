# post-40 QA — `ponswarp-desktop`를 만든 진짜 이유

## Artifact check

- Draft: `content/ponswarp-retrospective/drafts/post-40.txt`
- HTML fragment: `content/ponswarp-retrospective/html/post-40.html`
- QA note: `content/ponswarp-retrospective/qa/post-40.md`
- SVG assets:
  - `content/ponswarp-retrospective/assets/post-40/why-desktop.svg`
  - `content/ponswarp-retrospective/assets/post-40/native-stack-map.svg`
  - `content/ponswarp-retrospective/assets/post-40/decision-filter.svg`

## Structure QA

- Follows the established retrospective arc: problem framing, product state, system structure, failure point, design change, retrospective judgment, read evidence.
- Uses the Season 5 topic directly: post-40 is focused on why `ponswarp-desktop` was created, not on a full QUIC deep dive or the later stall reserved for posts 41~42.
- Keeps service-analysis dimensions visible: project lineage, technology stack, user flow, system flow, feature structure, operating/distribution tradeoff, product decision change.

## Tone QA

- Korean prose uses the existing `~합니다` retrospective tone.
- Avoids banned summary phrases such as `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, and overconfident lesson language.
- Treats the desktop branch conservatively: it is framed as an experiment/comparison filter, not as a secretly successful product or a solved architecture.

## Evidence QA

- Grounded in documented local series evidence:
  - `series-plan.md`: post-40 title, Season 5 desktop branch, `ponswarp-desktop` created on `2025-12-17`, native / QUIC / Tauri hope, later stall.
  - `evidence-index.md`: created `2025-12-17`, observation point native / QUIC / Tauri, late visible activity `2026-02-18`.
- Uses existing series commit anchors only as contextual evidence:
  - `638bc83` memory blow-up prevention.
  - `21dc9ba` receiver save-complete handshake.
  - `54cf5f4` receiver-side backpressure.
  - `15aef19` pons-core-wasm initial setup.
  - `44fb5ad` Rust signaling server initial implementation.
- Does not invent undocumented implementation internals for `ponswarp-desktop`; desktop-specific claims are limited to native / QUIC / Tauri hypothesis and documented activity window.

## HTML QA

- `html/post-40.html` is a Tistory-ready fragment, not a full HTML document.
- Uses inline styles consistent with existing posts.
- Embeds all three diagrams as `data:image/svg+xml;base64,...` image sources.
- Includes code-style spans for repository names and commit anchors.
- No markdown fences are present in the HTML.

## Visual QA

- Three SVG diagrams exist as standalone assets and are embedded in the HTML:
  1. `why-desktop.svg` — browser constraints to desktop experiment to changed questions.
  2. `native-stack-map.svg` — browser stack versus desktop hypothesis stack.
  3. `decision-filter.svg` — how the branch reframes browser frustration into product judgment.
- Diagrams are explanatory rather than decorative and match the article's central claims.
- SVG text is Korean/English mixed in the same style as prior assets, with accessible `role="img"` and `aria-label`.

## Publish readiness

Status: **REVISE**

Reason: the article artifacts are complete and internally QA'd, but live Tistory publication has not happened in this task. Per series convention, publish readiness remains REVISE until live publish exists and is checked in the target surface.
