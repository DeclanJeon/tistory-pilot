# Character craft: role, filmable traits, voice, sheet format, QA

Read this guide once before designing a cast, character sheet, visual anchors, or image-sheet prompt for `designing-video-character-sheets`. Intake, invocation, scope, ID, and return-envelope rules live in the skill's `SKILL.md`; this file holds the craft detail that file points at. When the assignment calls for the full canonical `CHARACTER SSOT` (image-backed package per-character SSOT or explicit request), read [`character-ssot-master-prompt.md`](character-ssot-master-prompt.md) — its section 0–33 format, counts and prompt specs supersede the compact sheet format below.

## Role definition

Specify only the fields the brief needs:

- **이야기 역할:** protagonist, guide, opposing force, support, audience proxy, narrator, or personified idea — matching the video's mode.
- **목표와 행위 주도성:** what they try to do and which choices are genuinely theirs.
- **관심/믿음과 긴장:** what matters to them plus any supported contradiction, strength/flaw tension, or practical obstacle — shown through context and behavior, not diagnosis.
- **관계:** established relationships and who knows or can do what; no invented shared history, and a stated ability never implies exclusivity ("knows the route" ≠ "the only one who knows it").
- **변화:** a change or deliberate non-change only where the synopsis supports it; otherwise left open rather than manufactured.

The profile follows the mode. Fiction may use want/obstacle/choice/consequence for clarity but never forces redemption or a positive arc. Brand and explainer work keeps the customer as hero and the service as guide when framed that way — a guide role does not authorize a mascot or personification, and a service gets no personality, features, guarantees, or emotional victory without explicit support. Unspecified service form stays abstract or undepicted: a "subscription" label establishes no cadence, delivery method, boxes, packets, labels, or instruction cards. Documentary work never fabricates biography, and a brief needing no character gets none.

## Making traits filmable

Every visual cue ties to a role, action, or stated trait. Each supplied key trait or contradiction earns at least one filmable behavior or pose, carried into the image prompt's expression/pose row where useful — central traits never stay as bare labels. Draw only useful signals from:

- silhouette and proportions;
- posture, gesture, movement rhythm, signature pose;
- facial design and a small expression range;
- clothing, material, wear, functional details;
- a restrained palette and its story function;
- carried props and how they are handled.

**고정 앵커** (identity-defining features that persist) stay separate from **장면별 변화** (temporary expression, pose, dirt, damage, costume state). State what cannot change and which variants are permitted. Internal traits never collapse into stereotyped bodies, disabilities, costumes, or ethnic markers; occupational clichés are not character purpose — a prop is a design choice, not evidence of personality. An optional prop's technical purpose or effectiveness is claimed only with supplied or verified support; describe its visible form or leave it out.

## Voice profile

When the brief involves dialogue, narration, or a recurring on-screen voice, the sheet carries a **text** voice profile per character — this skill designs and describes; it never generates, records, or claims an audio file.

- **Profile fields:** tone, pace, placement (chest/throat/head as a design description), language or dialect **only when supplied**, and the emotional range the role needs. The demographic rule applies here verbatim: under explicit fictional-design delegation, voice age/gender/register are labeled proposals; without delegation and with no supplied age or gender, do not write "30s woman" or equivalent voice labels — describe the performance (texture, rhythm, register) instead. For real people, never infer an unrecorded voice.
- **Procurement route** — record which of the three paths applies as `supplied` / `proposed` / `unresolved`. These are alternative branches chosen by the brief and approvals, not a fallback order to walk down:

| Route | When | Handoff |
|---|---|---|
| ① User-supplied voice | Recording or existing audio uploaded | Inspect the actual file and record version/source/inspected scope; rights/consent are the user's assertion, recorded as such |
| ② Synthesis (TTS/cloning) | Requested or proposed for a voice with no recording | Rights/consent basis and actual tool capability confirmed first — cloning needs the real consent evidence and an available cloning feature; then a bounded audition approval before any generation. If cloning is unavailable, do not auto-substitute: offer audition candidates from route ③ for approval instead |
| ③ Closest available match | No recording and synthesis not authorized/requested | Compare currently available voices against the profile; final pick needs the same audition approval — never silently substituted |

- All three routes hand the final selection, listening check, and voice-identity continuity to [`../../video-production-assets/references/22-dialogue-lipsync.md`](../../video-production-assets/references/22-dialogue-lipsync.md)'s voice selection and listening procedure — this sheet only states the profile and the chosen route.

## Sheet format

The default compact sheet below applies unless a full canonical `CHARACTER SSOT` (sections 0–33 per `character-ssot-master-prompt.md`) was assigned or requested.

Per character, unless another format is requested:

1. **확정 정보와 미정 항목** — source facts and consequential unknowns.
2. **역할·행동** — role, goal, agency, relevant relationship, supported tension or intended change.
3. **시각 설계** — silhouette/posture, face/expression, clothing/material, palette, props, movement, with invented details labeled as proposals.
4. **연속성 앵커** — fixed traits, allowed variants, do-not-change rules.
5. **보이스 프로필** — when the role speaks: the profile fields and the procurement route from the Voice profile section; "not applicable" for silent roles. Silence is respected as-is — a role or video with no dialogue gets no invented narrator. Text only, no audio claim.
6. **재사용 이미지 시트 프롬프트** — one generic prompt in the user's requested language (Korean by default, even when a downstream model accepts English). A clean character-reference layout: full-body front/side/back views and a small expression/pose row where suitable. Only established or explicitly proposed anchors appear; without delegation, unspecified demographics stay uncommitted in both prompt and rules, while a delegated fictional design carries them as labeled proposals. Verify no unsupported label — "adult," "young," "middle-aged," "average build" — slipped in outside a labeled delegated proposal. Brand prompts carry no service packaging or instruction materials unless specified. Neutral background, consistent proportions, no irrelevant scenery, unsupported facts, or rendered-image claims. When a full SSOT is required, the prompt block instead follows the master spec's Sheet A–D specification: Sheet A is the identity-sheet spec whose actual image the coordinator's image executor produces for an image-backed package; B/C/D are specs that authorize no extra generation or spend.

Several characters each get a distinct sheet plus a short relationship/contrast map — under a full SSOT assignment, the CAST DIFFERENTIATION MATRIX (Character | Face | Silhouette | Color | Personality | Movement | Key Anchor) replaces it, resolving accidental overlap while preserving deliberately related supplied characters. Prompts keep identities separate and never merge characters into an unrequested scene illustration. One image prompt per character unless more were requested; a full SSOT instead returns its A–D prompt spec block.

## Self-check

- Role and agency consistent with the supplied story or audience framing?
- Every key trait readable as a specific playable action or visible cue?
- Fixed facts, proposals, and unresolved items clearly distinguishable?
- No unsupported motives, biography, product features, prop-effect claims, factual claims, or invented arcs — and, outside explicit fictional-design delegation, no uncommitted demographic or backstory choices?
- Visuals specific without stereotypes or occupational shorthand?
- Continuity anchors consistent with the spine, fixed details separated from scene variation?
- Voice profile (when present) stated as supplied fact vs labeled proposal, with no invented demographic label, no assumed provider, and no audio-generation claim?
- Each prompt carrying the right anchors and requested views, with no image claim?
- The actual sheet returned rather than a completion report?

Trauma, abuse, illness, or diagnosis is never required for depth, and a real person's psychological history is never inferred. Autobiographical or clinical craft material is an optional empathy/consistency aid, not diagnostic authority. Craft techniques apply within their relevant scope and are never factual evidence about a character.
