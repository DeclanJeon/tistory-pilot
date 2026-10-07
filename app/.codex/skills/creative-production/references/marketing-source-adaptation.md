# Marketing and source-adaptation lanes

On-demand reference for content where audience, channel, or performance matters: campaign copy, social posts, comparisons, marketing strategy documents, and shortform video adapted from source media. Marketing rules apply only to a marketing request — a generic video request is not one. Publish-ready means prepared; posting or live platform changes need a separately requested scope.

## 1. Campaign and social workflow

1. **Define audience, channel, success metric first.** Views, saves, clicks, replies, conversions, and publish-readiness require different outputs.
2. **Inspect relevant evidence before producing.** Read the supplied sources; add trend, competitor or platform research only when the brief needs it. Separate documented facts from creative framing.
3. **Use the requested format** — single post, thread, carousel, comparison table, vertical video, CTA card, or explicitly scoped variants.
4. **Produce variants only when requested or delegated.** For an authorized A/B set, explain the distinct angle rather than changing incidental wording.
5. **Validate claims and assets.** Prices, model names, benchmarks, capabilities, product features and benefits must trace to the brief or a checked source. A feature name such as “Pro” does not establish that it is easier, faster, better, or more convenient. Use neutral wording when a benefit or the relationship between an offer and a launch is unspecified; do not invent a causal link such as “launch celebration.” Treat operational instructions such as “I’ll post it” as scope, not audience-facing copy. Never guess current competitor prices or model names; use official or clearly labeled third-party sources and record the URLs.
6. **Run applicable quality gates** — for text: source fidelity, tone, purpose, requested CTA and length; for video: actual streams/timing, representative frames and caption overlap. Apply the ending-card check only when that card is part of the brief.
7. **Report tradeoffs plainly** — e.g. contain-blur chosen because full crop clipped captions; third-party benchmark used because no official figure exists.

When the brief calls for variants, vary a relevant audience question, demonstrable contrast, practical benefit, curiosity or personal perspective. Avoid fabricated urgency, anecdotes, numerical shock and social pressure. CTA choices such as save, follow, link or reply apply only to a requested call to action.

## 2. Korean-language social conventions

- Match the supplied voice, register, audience and exclusions; short social copy need not erase a requested formal or documentary tone.
- Put relevant, sourced price comparisons in the body only when comparison is the requested purpose.
- Emojis, hashtags and rivalry/personal angles follow the brief rather than a universal count or default.
- Keep the requested variant count and format exact.

## 3. Marketing strategy documents

For a requested full launch/strategy document, cover the sections its decision needs: positioning, supported audience segments, channel-specific copy, discoverability, content formats, measurement and release dependencies. Website copy, SEO/AEO/GEO, OG cards, visual identity and growth-channel plans are optional branches, not compulsory deliverables. Coordinate with the existing design/brand owner rather than inventing a parallel brand kit.

Keep the document evidence-bound: capabilities only with brief or source support; no invented social proof, guarantees, urgency, or contact details. When architecture or product facts change, re-audit the strategy sections that depend on them and flag gaps (e.g. implemented FAQ pairs vs defined pairs) rather than declaring completion.

## 4. Source-media adaptation (shortform/vertical)

Production decisions to settle first:

- Preserve original speech/audio, add narration, or use source captions only?
- Are source captions soft, hard-burned, both, or absent?
- Should hard captions be preserved, masked, translated, replaced, or avoided through cut selection?
- Is an ending CTA requested? If so, what exact text, assets and duration are authorized?

**Caption strategy options:**

- `native_source_captions_only` — source hard captions already readable and synced. Preserve them; disable generated subtitle layers entirely rather than masking.
- `clean_generated_captions` — no hard captions, or they are removed/hidden by the chosen framing.
- `translated_or_curated_captions` — captions rewritten or translated; verify timing and prevent stacking on remaining source text.

**Framing rules:**

- Never stack generated subtitles on readable source hard captions unless intentionally designing a bilingual layout.
- For hard-burned captions that a 9:16 full crop would clip, prefer contain-blur (blurred duplicate background behind the original frame) or candidate re-selection over opaque masks — a misaligned lower-third mask reads as unfinished.
- Contain-blur filter shape: split the stream, scale+crop+gblur the background, overlay the SAR-normalized foreground (`setsar=1` matters — non-1:1 SAR breaks concatenation with transition/ending cards).
- Prefer FFmpeg filter solutions over neural inpainting for caption handling unless a GPU/cloud approach is explicitly acceptable.
- If immersion (full crop) vs caption integrity (contain-blur) conflict, prefer caption integrity unless the user explicitly values immersion.

**Adaptation QA checklist:**

- Final file exists, non-empty; `ffprobe` confirms duration, resolution, streams, file size; record a checksum for traceability.
- Generated-subtitle overlap count is zero, or the generated subtitle layer is explicitly disabled for native-caption variants.
- Visually review representative frames and, when present, the ending card. Contact sheets alone do not verify subtitle sync, reading time or glyph rendering.
- Subjective publish-readiness requests include a viewer-style review (naturalness, subtitle comfort, content flow, framing/caption clipping, unnecessary overlays, CTA readability), not only automated checks.

## 5. Content critique gate

For a requested concept/script/draft review, use the canonical [production content-quality gate](../../video-production-assets/references/12-qa.md) under “내용 품질 판정”. Apply its purpose-appropriate evidence and repair criteria to text, not its unrelated media-inspection modules. This reference does not keep a second scoring rubric.

Marketing critique can compare requested audience/channel variants, but claims of improved views, retention or conversion need actual measurements. User acceptance and execution/publication authorization remain separate.

