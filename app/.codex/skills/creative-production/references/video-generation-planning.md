# Video generation planning, prompting and critique

On-demand reference for the video execution lane. Load this only when the request involves AI video model selection, prompt composition, shot decomposition for generation, hybrid pipeline design, or critiquing a generated clip. A planning artifact — requirements matrix, dialect-correct prompt, shot plan, or QA verdict — is a deliverable; it never authorizes a paid job, media submission, or publication.

Nothing here requires a specific provider, catalog file, or runtime. [video-prompt-dialects.json](video-prompt-dialects.json) contains provider-independent serialization examples, not model capabilities. Verify the selected endpoint's current syntax, availability, limits and price; a generic grammar example is not proof that a named model accepts it.

## 1. Shot requirements matrix

Use the canonical [production-execution reference](../../video-production-assets/references/24-production-execution.md) §3 to build per-shot hard requirements and preferences. A single prompt with a supplied verified input contract does not need a model comparison.

## 2. Model routing — live verification workflow

Read the same canonical reference §1–3 for cost eligibility, image discovery, live endpoint verification and per-shot routing. It owns the requirement matrix and cost policy; this coordinator reference owns prompt serialization (§3) and hybrid decomposition (§4), not another model catalog or budget ledger.

Carry the verified route/input contract into the prompt. Missing required live evidence blocks submission, not ordinary text preparation. Reuse supplied decisions and preserve the named provider; recommendations and fallback proposals never substitute for current-version execution/spend approval. Actual submission, async job handling and targeted revision follow §6.

## 3. Prompt composition — slots and dialects

Fill only the slots that serve the requested shot, then serialize using the verified input contract.

| Slot | Purpose |
|---|---|
| shot_type / subject | Framing and identifiable subject anchors |
| start_state / action / end_state | Observable change and edit-ready boundary states |
| setting / camera / lighting / style | Supported staging, movement and look |
| audio / dialogue | Only when requested and supported by the selected endpoint |
| duration / aspect / resolution / seed | Separate supported API controls from prompt text |
| negative | Targeted known failure only, using supported syntax |

Read [video-prompt-dialects.json](video-prompt-dialects.json) for narrative, production-spec, edit-command and interactive patterns. Natural-language instructions, reference labels, timestamps and sound markers are examples, not universal API syntax. Preserve the user's requested language. Do not infer current model support, quality, length caps or resolution from a static table.

Composition rules:

1. Never emit a prompt for a feature the model lacks (dialogue on a silent model, 30s on an 8s cap).
2. Prefer one coherent primary camera action per shot; split incompatible moves or unmanageable beats while preserving the requested sequence.
3. Concrete over abstract: "rain-slick neon street at dawn", not "cool city vibe".
4. For i2v, describe *motion and change*, not the static image content.
5. Keep negatives minimal and only for known failure modes (text, watermark, extra fingers).
6. API-level controls (seed, aspect, duration, motion strength, structured camera params) belong in parameters when the endpoint exposes them, not prompt text.

When a local prompt corpus is configured, inspect its real layout before lookup. `VIDEO_PROMPT_CORPUS` may identify the corpus root; record actual example paths and reuse structure, not source content. An absent corpus does not block a normal prompt, and historical inventory totals, frequency statistics or host paths are not bundled evidence.

## 4. Shot decomposition and hybrid pipelines

Use the selected endpoint's verified duration limit and controllable action complexity to decompose the sequence. A **production storyboard** already includes the [complete contract](../../video-production-assets/references/storyboard-contract.md)'s integrated shot/camera/spatial/VFX/speech/audio specifications and clean-panel mapping; narrative panels still are not timed model clips. Preserve their order, IDs, reveal timing and continuity anchors.

For each clip inherit shot/scene/beat IDs and source synopsis locator, approved board version, start/peak/end panel IDs and actual image file/asset/hash, local-to-global action intervals, canonical subject/prop states, camera/spatial versions, VFX, literal speech/voice/lipsync and audio-cue IDs. Missing required cuts or unresolved image-only story blockers stop a production-board handoff. A text-only plan may state missing files honestly; it is not a visually approved board. Verify the selected endpoint's actual support before translating timestamps, first/last-frame inputs, audio or camera controls.

Repeat stable subject descriptors and supply approved references using documented input roles. Time-addressed beats and first/last-frame chaining are conditional techniques, not universal model features. A chained last frame must be inspected before it becomes the next reference, since it can carry an identity/contact defect forward. Return `Shot ID [start–end] — source beat/panel IDs, framing, local action intervals, camera, continuity anchors, prompt and applicable VFX/audio/speech/lipsync`, omitting unrequested detail for a single-prompt response. Technical shot ownership remains with the production-assets shot module; model splitting must not silently drop the intermediate contact/reveal states.

**Hybrid pipeline recipes**:

- **Blender → i2v/V2V**: Blender supplies exact camera path, lighting, composition; render a clean plate or first(+last) frame; the AI prompt describes only the *motion + style delta* Blender can't rig (cloth billow, particles, atmosphere), restating lighting to preserve it. Via `blender-previsualization` for the real scene.
- **Image → video two-stage**: full art direction in a strong image model, then an i2v prompt describing only motion.
- **ComfyUI node chains**: use the installed workflow's actual nodes, model files and input contract; verify their dependencies and memory/compute needs. Duration/resolution are node controls when exposed. Local computation does not bypass execution approval or imply zero cost.
- **V2V edit passes**: instruction models take a clip + verb (extend, replace background, restyle, remove, relight); reference-driven swaps where supported.

| Goal | Pipeline |
|---|---|
| Exact camera/composition | Blender → i2v or V2V |
| Character consistency across clips | image ref → reference-to-video |
| Long sequence | shot decomposition + FLF2V chaining |
| Fix/restyle existing footage | V2V edit verbs |
| Authorized local execution | Available ComfyUI workflow after runtime/dependency checks |

## 5. Generated-clip critique and iteration

For actual inspection passes, failure evidence, severity, routing verdicts and bounded retries, read [the canonical generation QA/retry reference](../../video-production-assets/references/21-generated-video-qa-retry.md). It owns the production-side QA procedure; this coordinator does not maintain another scoring rubric or attempt ledger.

A critique requires actual media or explicitly supplied observations. Separate supplied observations from your own viewing/listening and causal hypotheses. Return the requested findings and correction; unavailable checks remain unverified. Critique or a corrected prompt is not approval to regenerate, reroute, spend or publish. Carry its shot/input version, problem timecode and repair criterion to the owning project artifact.

## 6. Submission and job lifecycle

Applies only to authorized actual media submission; text-only prompt/plan work ends at the artifact.

- Submit the approved scope through the selected executor's real interface — direct API, CLI, or a connected tool protocol, whichever it actually exposes; none is mandatory. Before submitting, confirm the approved N (shot/output count) and its total-estimate summary are recorded in the execution artifact; [production execution §1](../../video-production-assets/references/24-production-execution.md#1-비용-정책-free-first--no-paid-by-default) owns that estimate gate, and a missing or stale summary stops submission. Unsupported settings or an unverified price stop submission; a prompt or critique is not execution permission.
- Async jobs follow that tool's own wait/poll rule. Track the actual request/job/result IDs and pending status in the linked execution artifact; when an attempt is resolved, retain these details in `generation_attempts.notes` with its actual result. Unknown submit status is resolved through the tool's status check — never by resubmitting, which risks duplicate spend. Report failures and partial successes as they are.
- Inspect actual output before reporting success. Distinguish your own viewing/listening from user-reported observations.
- Targeted revision changes one primary variable at a time and names the preserved successful attributes (`generation_attempts.changes`, `preserve`), staying inside the approved retry/spend caps — see [QA/retry §5](../../video-production-assets/references/21-generated-video-qa-retry.md). Preserve historical attempt records; changed inputs make only affected dependent artifacts and approvals stale, not a new status field on attempts.
