---
name: orchestrating-video-preproduction
version: 2.5
description: Use for text-only video preproduction that spans multiple artifacts — a complete planning package or one idea carried from concept through synopsis, characters, and storyboard. Delegated planning lane under creative-production; returns text and generic image prompts, never media.
---

# Orchestrating Video Preproduction

This lane moves a single brief through whichever planning stages were requested while holding one premise steady across all of them. Answer in Korean unless told otherwise. Deliverables are structured text plus reusable image prompts; nothing here produces or claims images or video.

`creative-production` alone coordinates content and video projects. This skill is its delegated text-planning lane — on a standalone call, consult `creative-production` once to confirm scope and route, then perform only the requested planning. When work arrives already delegated, inherit the coordinator's brief, IDs, versions, and approvals: no call-backs, no re-routing, no second interview or approval ledger — with stage packet intake and worker return per the canonical [worker handoff and single writer](../video-production-assets/references/contract.md#worker-handoff-and-single-writer). Text planning alone never creates a project folder, `project.json`, stills, or a sample video. Anything beyond text — image-backed packages, generation, editing, delivery, publication — goes back to `creative-production` as a plan and handoff; this lane never executes or picks an executor.

Text-only forbids media, files, and spend — not technical planning: a storyboard requested here defaults to the complete production plan under [`../video-production-assets/references/storyboard-contract.md`](../video-production-assets/references/storyboard-contract.md). Rough narrative panels or prompt-only thumbnails apply only on an explicit request for that narrow exercise.

## Choosing the stages

- **Package request:** run the applicable stages in sequence — concept/synopsis via `developing-video-synopses`, characters via `designing-video-character-sheets`, board via `storyboarding-video`. If a sibling skill is not loaded, follow its `SKILL.md` in the same-named sibling directory; that file points at the one detailed guide the stage needs — never bulk-load every downstream guide.
- **Single-artifact request:** invoke only the matching specialist and return only that artifact. Never build the full package, never ask permission to skip unrequested stages, never treat an omitted stage as an open question.
- Mapping is direct: concept or synopsis → `developing-video-synopses`; a character sheet → `designing-video-character-sheets` without inventing a synopsis; panels → `storyboarding-video` preserving any supplied synopsis.
- Applicability is mode-dependent: omit inapplicable characters and fictional plot elements, not explicitly requested planning artifacts. Character-free, factual and abstract briefs retain their requested concept, informational/visual synopsis, beat planning and board without fabricating a cast or conflict.

## Detailed guides

- **Multi-stage or package request:** read [`references/video-direction.md`](references/video-direction.md) for the interaction modes, direction decision, discovery flow, choice statuses and checkpoints, and [`references/stage-execution.md`](references/stage-execution.md) for the canonical spine fields, per-stage craft requirements, integrity standards, package assembly, and the final consistency pass. These are the two lane guides; a single-artifact call opens neither.

## Missing technical inputs

A production storyboard needs camera/spatial, VFX, speech/lipsync, and audio specifications from their specialist owners. When the inherited packet lacks them, this lane does not reroute, pick owners, or reopen the pipeline: return **one indexed requirement packet** to `creative-production` listing each blocked slot by scene/shot/beat index, the required input, and the blocker — then continue its own assigned text stages and resume board assembly from the owner packets the coordinator returns. Unresolved requirements stay explicitly unresolved/blocking; the board never silently shrinks to rough panels, and this packet is an internal dependency boundary, not a second interview or approval ledger.

## Package return

A full package returns the assembled sections defined in `references/stage-execution.md` — shared spine, concept/synopsis with stable beat IDs, character sheets, Visual Bible, the storyboard, and the consistency/unresolved/review status. Delegated returns additionally carry the assigned artifact/entity IDs and output versions, a dependency/dependency_versions proposal naming each input artifact version used, assumptions, checks performed, and remaining blockers, per the canonical [worker handoff and single writer](../video-production-assets/references/contract.md#worker-handoff-and-single-writer). Standalone chat work allocates no project or artifact IDs.

## Acceptance

Done means the requested stages — no more, no fewer — returned as actual artifacts consistent with the spine, every supplied choice and approval reused verbatim, each claim carrying its fact status, the board's technical slots integrated or explicitly carried as the indexed requirement packet, and nothing implying generated media, files, or spend. When the coordinator continues into an image-backed package, this lane's handoff requires (downstream of it): the paginated storyboard sheet set (≤8 panels per sheet, `<stem>_sNN.png` when the board paginates), mandatory `split_storyboard.py --sheet` extraction of clean panels plus per-scene overview images with `split-manifest.json`, visual inspection of the actual extracted pixels, and operation recording via `recording-production-history` (`production_history.py init/record`) per the shared storage contract — all registered back to the coordinator's ledger, never to a parallel ledger.

## Handoff

Beyond the package, the lane hands off the direction decision, interaction mode, choice statuses, stable beat/panel IDs, Visual Bible, and continuity ledger so the receiving stage inherits them as-is rather than re-interviewing. Shot-level production specifications inside the board contract are this lane's own text deliverable; model-specific clip decomposition and execution are handed to `creative-production`, which selects the downstream owner and provider. Planning approval is never spend approval.
