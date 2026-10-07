---
name: designing-video-character-sheets
version: 2.5
description: Use to design video characters — a cast or character bible, a single character sheet, visual identity anchors, or a reusable character image-sheet prompt.
---

# Designing Video Character Sheets

Produce role-aware character profiles with repeatable visual designs from a supplied story or character brief. Return the sheet itself in Korean by default. Standalone output is text plus prompt specs — with no claim or implication that an image exists; under a delegated image-backed package, one per-character Identity Sheet A image is produced by the coordinator's image executor, and this skill returns the versioned SSOT text packet and its sheet-A spec.

Characters are the only scope here — not plot, not panels. A supplied synopsis and its story spine stay intact; no added scenes, endings, product claims, or manufactured arcs. Full pipelines route through `creative-production` → `orchestrating-video-preproduction`; panels belong to `storyboarding-video`.

## Inputs and invocation

Extract characters, roles, relationships, goals, behavior, setting, constraints, visual requirements, and existing spine anchors. Supplied details are never re-asked. Supplied character sheets, reference images and voice notes are inspected and reused with their application scope recorded — which sections actually apply to this production — rather than rebuilt; an unreadable supplied sheet stays unverified. Persona — how the character speaks, reacts and carries itself — is captured as filmable behavior and dialogue direction so the downstream voice/speech stage inherits it consistently.

`creative-production` alone coordinates projects. Standalone calls consult it once to confirm scope and route, then deliver only the requested character work. Delegated work continues on the existing spine, IDs, versions, and approvals — no call-backs, re-routing, second interview, or second approval ledger — with stage packet intake and worker return per the canonical [worker handoff and single writer](../video-production-assets/references/contract.md#worker-handoff-and-single-writer).

Three labels govern every field:

- **확정 정보** for user-provided facts and observed source material (with its inspected scope recorded).
- **디자인 제안** for labeled creative choices — including missing age, gender, build, and backstory — made under explicit fictional-design delegation. A full delegated fictional SSOT uses this label; it stays easy to change and is never asserted as fact.
- **미정** for consequential unknowns. Without delegation, consequential unknowns stay open: do not select an unsupplied age, gender, ethnicity, or body type even as a proposal — skip labels like "adult," "young," "middle-aged," "average build" and create specificity through pose, costume, material, palette, and props. For real people, never invent undocumented biography, psychology, or personal facts. Irrelevant exact numbers stay unspecified. An already-approved character's supplied choices are preserved; only gaps get proposals.

One concise question is warranted only when an unresolved choice materially changes the character's role or the story; otherwise proceed with labeled proposals. An invented behavior, audience habit, product feature, or real-world claim is never written as fact — a trailing assumption label does not repair a claim already asserted.

## IDs

Every sheet gives each character a stable `character_id` (existing spine IDs first, otherwise sequential `CH01`-style IDs) used verbatim by panels, prompts, and the relationship map; under delegation, any assigned character/sheet-artifact IDs in the packet are used instead of new ones. Standalone text allocates no project or artifact IDs — `character_id` is a content ID inside the artifact, not allocated artifact identity.

## Detailed guide

Before drafting, read [`references/character-craft.md`](references/character-craft.md) — role definition, filmable-trait conversion, the voice profile and its three procurement routes, the per-character sheet format, and the self-check. It is the one detailed guide for this stage.

When the assignment is a full canonical `CHARACTER SSOT` — a per-character SSOT inside an image-backed preproduction package, or an explicit request for the complete format — also read [`references/character-ssot-master-prompt.md`](references/character-ssot-master-prompt.md), the section 0–33 specification for identity locks, anchors, persona/psychology/backstory depth, turnaround, anti-drift, the A–D sheet prompts, prompt text, appeal review and cast differentiation. The ledger-ready layout is [`video-production-assets/assets/character-ssot-template.md`](../video-production-assets/assets/character-ssot-template.md). B/C/D sheet prompts are specs — they authorize no extra generation or spend; only Sheet A is the mandatory actual per-character image, produced by the coordinator's image executor. A glam portrait never substitutes for the actual sheet.

## Acceptance

Done means each requested sheet is returned — not a completion report — with 확정 정보/디자인 제안/관찰/미정 distinguishable, continuity anchors separated from scene variants, an in-scope voice profile where the role speaks, one reusable image-sheet prompt per character, and no invented real-person facts, claims, or media. A full delegated SSOT additionally keeps all 0–33 sections with their stated counts, a persona mappable to `{role, personality, observable_behavior, speech}`, and the Sheet A identity-sheet spec.

## v5.1 master pack and lineage

A recurring production-critical character is not locked by one attractive portrait. Under an image-backed package the returned SSOT packet also marks which Character Master views the project actually needs: identity turnaround (front neutral, front 3/4, profile, rear), face identity close-up with hairline and color anchors, story-relevant expression range only, full-body proportion/scale reference, one WARDROBE ID (WD) per recurring costume, and DO-NOT-CHANGE identity locks (face shape, eye spacing, nose/mouth proportions, hair silhouette, body proportions, signature marks, age appearance). Identity references use neutral production-readable lighting and pose — no extreme lens, dramatic pose, or colored lighting as sole identity reference.

Scene-specific state (wet/damaged/wardrobe-layer/props-in-hand/emotional baseline) is a **derivative** asset, never a redefined identity: it pins `master_asset_ref={asset_id, version}` of the Character Master and lives under that scene's state. A master version bump stales its derivatives until re-pinned — do not edit scene copies independently. The coordinator records `role: master|derivative` and `master_asset_ref` in `asset_registry`; the skill proposes them in its packet.

## Return and handoff

Delegated returns follow the canonical [worker handoff and single writer](../video-production-assets/references/contract.md#worker-handoff-and-single-writer): report the assigned `character_sheet` artifact ID and output version, each character's `character_id` and `persona` (`{role, personality, observable_behavior, speech}` — `N/A` explained for silent roles), the dependency/dependency_versions proposal naming the supplied synopsis/sheet/voice-note artifact versions used, material assumptions, the checks actually performed, and unresolved inputs. Under an image-backed package, the return also carries each character's Sheet A prompt spec and the proposal linking the coordinator-registered `identity_sheet_asset_id` (`kind=character_identity_sheet`, `entity_type=character`, `entity_id`=character id) once the image executor produces it; this skill never produces or claims the image itself. Where the coordinator allocated them, the per-character voice profile also carries its explicit `voice_profile` artifact ID and version in the return; standalone text allocates none. Storyboard requests inherit the characters' stable visual anchors, allowed variants, relationships, and unresolved design choices via `storyboarding-video`. Anything beyond text planning returns to `creative-production` or `orchestrating-video-preproduction` — execution is never routed from here. The story spine is preserved; the premise is never silently revised to justify a design choice.
