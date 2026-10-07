---
name: creative-production
description: Use for content creation or adaptation, including articles, social posts, campaigns, scripts, storyboards, audio, images, and video planning, AI-video prompt composition, model routing, generation critique, editing, QA or delivery; also hybrid 3D/web creative productions. Applies to single artifacts and full productions, not ordinary UI styling or unrelated application development.
metadata:
  version: "1.8.1"
---

# Creative Production

One brief, one coordinator, one requested deliverable. Skills are instruction modules; use the host's actual tools/workers, not a presumed autonomous scheduler. Coordination does not enlarge the request.

## Scope and inputs

Read the current request and supplied or explicitly linked project material. Preserve language, exclusions, fixed facts, selected tools, continuity, source versions and actual approvals. Unreadable material stays unverified. Separate evidence, calculations, interpretation and proposals. Unrelated prior examples are not current constraints.

Reuse supplied/approved choices and the active interview flow. Ask only for a consequential unresolved choice unavailable from tools/sources. Open creative direction needs supplied, accepted or explicitly delegated authority; silence is not approval. A locked brief or one artifact needs no project interview.

## Select one current stage

Use [production-routing.md](references/production-routing.md) once to select the current owner and required dependency. Read that worker and its current-stage guide only. Do not preload future craft, provider catalogs or full-pipeline checklists.

An ordinary **콘티/storyboard defaults to a complete production plan**, including the canonical full coverage and technical slots. Explicit rough-panel/prompt-only exercises stay narrow. Text-only means no media/files/spend, not omission of technical planning. Missing applicable specialist inputs return one indexed requirement packet; integrate returned specifications before finalizing the board.

A standalone specialist consults this scope once. Delegated specialists continue the packet; no callback loop, second interview or rival approval ledger. `orchestrating-video-preproduction` sequences only assigned text stages, not the whole project. Ordinary UI/brand/application work keeps its design/development owner; hybrid media consumes that owner's visual contract.

## Focused handoff and state

A chat-only draft, prompt, critique, synopsis or board can finish in chat without media, files or a project. When actual content files are produced, use **REQUIRED SUB-SKILL: `recording-production-history`** before the first write. Initialize `<actual user Documents>/studio_production/<project_id>` and its package layout; reuse the active project rather than create a second root. Every intermediate and final output is saved there, registered with observed paths, and reported to the user by absolute saved path. Never save production outputs in the skill repository. Requested text saving still does not imply image generation.

For existing multi-stage production use the selected root's canonical `project.json` and [worker handoff/single-writer contract](../video-production-assets/references/contract.md#worker-handoff-and-single-writer). Package support manifests and derived adapters are not production ledgers. Preserve domain bibles/state as versioned linked artifacts, not rewritten schemas.

Build one compact packet: assigned stage/output/focus IDs; current source IDs/versions; locked facts/continuity/exclusions; relevant approval references; required inputs and blockers. Use the contract's read-only focused index when useful; do not infer a stage from file presence. The worker returns indexed changes, actual evidence and gaps. Only the coordinator persists authorized changes, rechecks versions, validates and starts the next assigned stage. Text-only/no-save work returns proposals without any ledger write.

The coordinator owns the history lifecycle as well as canonical state writes. Log the operation's actual prompt and method before execution, then its observed outputs and completed/failed/interrupted outcome in chronological project-local `.history/events/*.md`. On resumption inspect pending operations, record the interruption/resume and reconcile remote jobs before retrying; interrupted orchestration is not provider failure. `recording-production-history` owns only audit/storage mechanics, not approvals, artifact versions or stage selection. Project completion is separate from operation completion and requires the requested deliverables and exercised QA.

## Planning, review and execution

Full topic-to-video or image-backed packages read [preproduction-review.md](../video-production-assets/references/preproduction-review.md) before project writes/media calls. The history skill resolves the cross-platform Documents directory and creates the project root without hardcoded usernames. An explicitly selected existing root is reused with its actual location reported. Resolve an unset full-production runtime/structure once: 30s/1m/2m/5m/10m/30m/up-to-1h or supplied length, chapter/single-film/series; long form decomposes whole → chapter/episode → scene → shot. Do not impose this on a narrow artifact.
Full image-backed preproduction follows an asset-first chain: source adaptation/synopsis → active LOOK/style-world bible → required locked character/location/prop/product masters and scene derivatives → indexed technical storyboard → readable actual storyboard sheets → mandatory per-scene and per-panel image extraction → complete-package and visual checks → user review. Each sheet has at most eight panels; dense cards use fewer. The coordinator checks the v5.1 asset gate before FINAL sheet generation; missing/draft/stale critical inputs permit only explicitly PRELIMINARY work. Record exact asset versions and provenance under the canonical [full-package contract](../video-production-assets/references/contract.md#전체-프리프로덕션-패키지). A portrait/prompt cannot substitute for a master pack, and text or individual panels cannot substitute for sheets plus extracted scene/panel images. Inspect and report all saved paths; missing artifacts block readiness.

Keep video-model choice unresolved during preproduction. Current-version review acceptance is not execution approval. A separate proceed request opens a live-verified bounded plan under [video-generation-planning.md](references/video-generation-planning.md); actual submission waits for explicit execution and applicable spend approval. Free/local samples, moving animatics and exports need the same gate; preview does not authorize final production unless both were explicitly covered.

Apply [selected-runtime gate](references/production-routing.md#selected-runtime-gate) only to actual requested execution. Default content/review images use `codex-imagen`; Codex Imagen still-image calls do not require price, usage, quota, or cost-approval checks. The package excludes Higgsfield image submissions/fallback. Missing runtime/auth/capability is a named blocker, not permission for a silent substitution or fake equivalent result. Changed inputs invalidate affected dependent approvals, not unrelated work.

## Execution and delivery

Check only the selected surface's runtime/auth. No automatic installation. Preserve source assets, isolated requested outputs and credential secrecy. Use deterministic camera/geometry for exact space, composition for critical text/logos/prices, and actual assembly/encoding tools. Inspect outputs before authorized scaling. Parallelize only independent work; dependency chains and uncertain async status never justify duplicate paid submission.

Use [creative-qa.md](references/creative-qa.md) for the actual requested surface: text/source checks, audio listening, video playback/timing/continuity/encoding, Blender scene/render inspection or browser inspection. Clip critique follows generation-planning §5. Schema success is not visual quality, rights clearance or user approval.

Only a requested reference comparison/retrospective loads [production QA](../video-production-assets/references/12-qa.md#레퍼런스-의도-대조-해당-작업만). Findings are evidence-scoped and qualitative; project lessons do not authorize skill/profile updates or retries. Reference analysis alone stays read-only; an explicit package-optimization request may change package code/docs without generating production media.

Return actual intermediate/final file locations and `.history` record paths as soon as each output is saved, with exercised checks and current lifecycle state. Distinguish plan, generated file, inspection, user acceptance and publication. Register only actual outputs; name missing/failed outputs and unverified conditions. For complete file packages produce the traceable versioned ZIP under `10_DELIVERY` with the canonical manifests and applicable handoffs. API success, prompts, empty directories and predictions are not completed delivery.
