"""v5.1 asset gate: may declared-FINAL artifacts be produced right now?

check_asset_gate(project, artifact_ids=None) inspects the canonical ledger in
memory — no file system access, no media decoding, no approval attestation.
It returns blocker strings; an empty list means every checked `finality: final`
artifact's required assets are registered, locked and pinned at their current
version, and its dependency chain has no missing, draft, stale or version-
drifting links.

An asset counts as locked only at status `verified` — the v5.1
LOCKED / APPROVED / VERIFIED_REFERENCE tier. `available` means a file exists
but has not passed its asset QA gate, so a draft/uninspected master with an
available file still BLOCKS final production. A declared final visual board
(type storyboard or storyboard_sheet) additionally requires an ACTIVE LOOK:
project.look_asset_id must point to a registered style-world-bible/look asset
with verified status, and the board must pin its current version in
required_asset_versions. Preliminary work never needs this gate. Pass
`artifact_ids` to scope the check to selected final artifacts (e.g. one
storyboard) so unrelated stale declarations don't block a request; with None
every final artifact is checked.
"""

VISUAL_TYPES = ('storyboard', 'storyboard_sheet')


def check_asset_gate(project, artifact_ids=None):
    """Return blocker strings; [] means the selected final scope is clear."""
    blockers = []
    if not isinstance(project, dict):
        return ['project must be an object']
    assets = {row['id']: row for row in project.get('asset_registry', [])
              if isinstance(row, dict) and isinstance(row.get('id'), str)}
    artifacts = {row['id']: row for row in project.get('artifacts', [])
                 if isinstance(row, dict) and isinstance(row.get('id'), str)}

    def locked(asset_id, expected, owner_label):
        asset = assets.get(asset_id)
        if asset is None:
            blockers.append(f'{owner_label}: required asset {asset_id} is not registered')
        elif asset.get('status') == 'stale':
            blockers.append(f'{owner_label}: required asset {asset_id} is stale')
        elif asset.get('status') != 'verified':
            blockers.append(f'{owner_label}: required asset {asset_id} is not locked '
                            f'(status {asset.get("status")}; verified required)')
        elif expected is not None and asset.get('version') != expected:
            blockers.append(f'{owner_label}: required asset {asset_id} version drift '
                            f'(pinned {expected}, current {asset.get("version")})')
        if asset is None:
            return
        seen = {asset_id}
        current = asset
        while isinstance(current.get('master_asset_ref'), dict):
            reference = current['master_asset_ref']
            master_id = reference.get('asset_id')
            if not isinstance(master_id, str) or master_id in seen:
                blockers.append(f'{owner_label}: invalid or cyclic master lineage for {asset_id}')
                break
            seen.add(master_id)
            master = assets.get(master_id)
            if master is None:
                blockers.append(f'{owner_label}: master asset {master_id} is not registered')
                break
            if master.get('status') != 'verified':
                blockers.append(f'{owner_label}: master asset {master_id} is not verified '
                                f'(status {master.get("status")})')
            if reference.get('version') != master.get('version'):
                blockers.append(f'{owner_label}: master asset {master_id} version drift '
                                f'(pinned {reference.get("version")}, current {master.get("version")})')
            current = master

    selected = None
    if artifact_ids is not None:
        selected = set(artifact_ids)
        unknown = selected - set(artifacts)
        for aid in sorted(unknown):
            blockers.append(f'{aid}: requested artifact is not registered')

    look_id = project.get('look_asset_id')
    look = assets.get(look_id) if isinstance(look_id, str) else None
    final_boards = []
    for aid, artifact in sorted(artifacts.items()):
        if artifact.get('finality') != 'final':
            continue
        if selected is not None and aid not in selected:
            continue
        if artifact.get('type') in VISUAL_TYPES:
            final_boards.append((aid, artifact))
        if artifact.get('status') in ('draft', 'stale'):
            blockers.append(f'{aid}: {artifact.get("status")} artifact cannot be final')

        required = artifact.get('required_asset_versions')
        if not isinstance(required, dict) or not required:
            blockers.append(f'{aid}: final artifact needs required_asset_versions')
        else:
            for asset_id, expected in sorted(required.items()):
                if not isinstance(expected, str) or not expected.strip():
                    blockers.append(f'{aid}: required_asset_versions {asset_id} '
                                    'needs a nonempty version pin')
                locked(asset_id, expected, aid)

        # The active LOOK is a required input of every final visual board:
        # the board must pin the registered look's current version.
        if artifact.get('type') in VISUAL_TYPES:
            if not isinstance(look_id, str) or not look_id.strip():
                blockers.append(f'{aid}: final visual artifact requires an active look_asset_id')
            elif look is None:
                blockers.append(f'{aid}: look_asset_id {look_id} is not a registered asset')
            else:
                kind = look.get('kind')
                if kind not in ('style_world_bible', 'document') \
                        and look.get('entity_type') != 'look':
                    blockers.append(f'{aid}: look_asset_id {look_id} is not a '
                                    f'style_world_bible/look asset (kind {kind!r})')
                if not isinstance(required, dict) or look_id not in required:
                    blockers.append(f'{aid}: final visual artifact must pin the active look '
                                    f'{look_id} in required_asset_versions')
                locked(look_id, required.get(look_id) if isinstance(required, dict) else None,
                       f'{aid} (active look)')

        for dep, expected in sorted((artifact.get('dependency_versions') or {}).items()):
            owner = artifacts.get(dep)
            if owner is None:
                blockers.append(f'{aid}: dependency version pins unregistered {dep}')
            elif owner.get('version') != expected:
                blockers.append(f'{aid}: dependency {dep} version drift '
                                f'(pinned {expected}, current {owner.get("version")})')
        visited = {aid}
        stack = list(artifact.get('dependencies', []) or [])
        while stack:
            dep = stack.pop()
            if dep in visited:
                continue
            visited.add(dep)
            owner = artifacts.get(dep)
            if owner is None:
                blockers.append(f'{aid}: dependency {dep} is not registered')
                continue
            if owner.get('status') == 'draft':
                blockers.append(f'{aid}: dependency {dep} is still a draft')
            elif owner.get('status') == 'stale':
                blockers.append(f'{aid}: final depends on stale artifact {dep}')
            for pinned_dep, expected in sorted((owner.get('dependency_versions') or {}).items()):
                upstream = artifacts.get(pinned_dep)
                if upstream is not None and upstream.get('version') != expected:
                    blockers.append(f'{aid}: chain link {dep} has {pinned_dep} version drift '
                                    f'(pinned {expected}, current {upstream.get("version")})')
            stack.extend(owner.get('dependencies', []) or [])

    # Panel-level version pins for checked final boards: panels must reference
    # the exact locked assets their shot uses plus the active LOOK.
    if final_boards:
        shots = {row['id']: row for row in project.get('shots', [])
                 if isinstance(row, dict) and isinstance(row.get('id'), str)}
        for panel in project.get('storyboard', {}).get('panels', []):
            if not isinstance(panel, dict):
                continue
            label = panel.get('id', 'panel')
            avr = panel.get('asset_version_refs')
            if not isinstance(avr, dict) or not avr:
                blockers.append(f'{label}: final panel needs asset_version_refs')
                continue
            required = set(shots.get(panel.get('shot_id'), {}).get('asset_ids') or [])
            if isinstance(look_id, str):
                required.add(look_id)
            for asset_id in sorted(required - set(avr)):
                blockers.append(f'{label}: missing required asset reference {asset_id}')
            for asset_id, expected in avr.items():
                locked(asset_id, expected, label)
    return blockers
