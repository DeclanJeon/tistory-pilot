---
name: video-model-router
description: Pick a current AI video model only after checking live provider catalogs, exact endpoint schemas, constraints, and pricing. Use before video-prompt when model choice is unresolved, or to verify a user-named model against a specific shot requirement.
---

# Video Model Router

Model choice follows the shot requirements; never let a remembered model table decide the brief.

## Scope

`creative-production` is the sole project-level coordinator for content/video production; this skill is the live model-verification specialist. Standalone invocation: consult `creative-production` once for scope/route, then verify/recommend only the requested model decision. Delegated by `creative-production`: proceed without calling back or re-running approvals. A model recommendation authorizes no prompt package, spend, or job submission.

## When to use

- The user has not selected a model and a production route needs one.
- A named model or endpoint must be checked against a concrete shot/input requirement.
- Two or more currently available candidates need an evidence-backed comparison.

Do not use this skill to create a prompt, generate media, or authorize spend. After a model is verified and selected, hand prompt construction to `video-prompt` or the chosen executor.

## Live verification workflow

1. Capture the shot's required input mode, duration, aspect ratio, output size, references, audio/dialogue, camera control, editing/multi-shot needs, latency, privacy, destination, and budget. Reuse facts already present in the brief.
2. Discover candidates from the current provider catalog or the provider's authoritative current documentation. A model name remembered from prior work is not proof that it is still available.
3. For each candidate, inspect the exact endpoint's current schema and limits. Verify every required input field, field type, enum, duration, aspect/output constraints, reference/audio behavior, and any source-media constraints. Do not infer one endpoint's support from a related model family.
4. Check current price for the actual shot duration/settings and note any usage, region, commercial-rights, privacy, or destination constraints that affect suitability.
5. Recommend one verified primary candidate and, only when useful, one separately verified fallback. State the decisive requirement, evidence/source, checked time, live cost, and any capability trade-off.
6. If no current catalog/schema/price evidence is available, state the missing check and stop at a bounded recommendation; do not claim capabilities or submit a request. If a user-named model fails a hard requirement, report that and ask before substituting another model.

## Decision order

Reject candidates that fail a hard input, output, duration, rights, or destination constraint before comparing preferences. Among the remaining candidates, compare visual/control fit, continuity, audio, privacy, latency, cost, and workflow compatibility using the user's priorities. Do not assume that a more expensive model is better or that a cheap model is suitable for a final.

## Handoff

Pass the selected exact model/endpoint, verified schema version or source, supported fields/limits, estimated price, and unresolved risks to the prompt author or executor. Do not hand off stale defaults. A model recommendation is not user approval for a paid job.
