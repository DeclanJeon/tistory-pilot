# Optional executor adapter

Use this reference only when a selected executor needs input outside the canonical production contract. For multi-stage video, [project.json's contract](../../video-production-assets/references/contract.md) remains the source of truth; a single prompt/edit needs no project manifest.

## Derive, submit, reconcile

1. Read the approved shot/asset IDs, source versions, continuity anchors and bounded execution plan from the existing project.
2. Check the actual selected endpoint's current schema, media/reference upload contract, duration/format limits, current price and authorization. Unknown required fields or pricing block submission.
3. Construct only that provider's accepted input. Do not send project metadata or invented generic runner fields as endpoint parameters. Record the exact endpoint/model version and available settings without claiming every provider supports the same seeds/controls.
4. Keep the derived request associated with its canonical shot ID and source versions. Keep credential values out of all artifacts.
5. Record real request IDs, actual output paths, provenance and inspection results back into existing project artifact/asset records. Partial success records only existing files; failed shots stay visibly incomplete.

The adapter is derived execution data, not a new global state machine or an independent shot-manifest file to maintain. Do not treat an API success, metadata example or expected path as actual generated media.

## Stable constraints

Keep the approved shot/output count, time/storage bounds, concurrency, retry scope and spend cap. Missing or silent values are not permission to submit additional work. Any change in approved source versions, model/input scope or price that changes the authorized plan needs the affected review/approval before execution.

For a 3D asset, retain its existing ID and associated source/license, scale, geometry/texture budgets, Blender source/export and requested fallback. Store those facts in the active artifact contract, not a separate project database. Publish only under a separately requested destination scope.
