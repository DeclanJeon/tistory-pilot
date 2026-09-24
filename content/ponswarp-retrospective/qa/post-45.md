# QA — post-45 결제를 붙이는 순간 제품이 달라지는 방식

## Artifact check

- Draft: `content/ponswarp-retrospective/drafts/post-45.txt`
- HTML fragment: `content/ponswarp-retrospective/html/post-45.html`
- QA note: `content/ponswarp-retrospective/qa/post-45.md`
- SVG assets:
  - `content/ponswarp-retrospective/assets/post-45/billing-product-shift.svg`
  - `content/ponswarp-retrospective/assets/post-45/entitlement-flow.svg`
  - `content/ponswarp-retrospective/assets/post-45/pricing-pressure-map.svg`

## Structure QA

- Follows the series skeleton: problem framing, 당시 제품 상태, 시스템 구조, 실제 실패 지점, 설계 변경, 회고 판단, 읽은 코드와 기록.
- Includes service-analysis dimensions: project structure, technical stack, user flow, system flow, feature structure, operating/deployment pressure, product judgment change, and billing/entitlement logic.
- Keeps the article focused on post-45 only: billing as a product-contract shift, not a general payment tutorial and not post-46’s deeper PayPal entitlement implementation story.

## Tone QA

- Korean prose uses the established reflective `~합니다` tone.
- Avoids banned summary phrases from `series-plan.md` such as `한 줄 요약`, `먼저 핵심만 보자`, and `결론적으로`.
- Does not overclaim success or publish/live status.
- Keeps the human retrospective stance: explains uncertainty, tradeoff, product judgment, and failure surface rather than presenting a generic AI-style checklist.

## Evidence QA

Grounded evidence references used:

- `series-plan.md` post-45 topic and Season 6 placement.
- `evidence-index.md` productization/revenue commits.
- `4847872` — async Cloud Drop for delayed downloads.
- `b6f3ea8` — first-class Cloud Drop pricing page.
- `f8f2120` — Stripe Checkout entitlement issuance.
- `2e4593d` — Cloud Drop billing routed through PayPal.
- `3628858` — resumable multipart large Cloud Drop uploads.
- `a004c91` — Free plan as first-class cloud policy.
- `212d751` — gated account and billing surfaces disabled.
- `d88a625` — GA4 production traffic measurement.

No undocumented implementation details were asserted beyond the series evidence index and planning docs. Payment discussion is framed as product/system responsibility rather than invented API internals.

## HTML QA

- `post-45.html` is a Tistory-ready fragment beginning with a wrapping `<div>`, not a full HTML document.
- HTML uses inline styles consistent with nearby posts.
- Contains embedded SVG images as `data:image/svg+xml;base64,...` URIs.
- Contains no markdown fences.
- Code/file/commit references are rendered with inline `<code>` styling.

## Visual QA

- Three original SVG assets created under `assets/post-45/`.
- Visuals are explanatory, not decorative:
  1. `billing-product-shift.svg` shows direct transfer → Cloud Drop → billing responsibility shift.
  2. `entitlement-flow.svg` shows pricing → payment → entitlement flow.
  3. `pricing-pressure-map.svg` maps user/system/operation pressure behind free/paid policy.
- SVGs are embedded into HTML as base64 data URIs and also kept as source assets.

## Publish readiness

Status: **REVISE**

Reason: article artifacts are complete and locally QA-reviewed, but live Tistory publish does not exist yet. Per assignment, readiness remains REVISE until live publish is created and checked.
