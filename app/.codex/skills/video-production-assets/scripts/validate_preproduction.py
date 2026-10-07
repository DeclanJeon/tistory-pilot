"""Additional full-package checks; shared validation owns record and file hashes.

No artistic, identity-similarity, rights or user-approval attestation is made.
Standalone plans without a full package do not use this gate.
"""
import re
import json
from pathlib import Path


def validate_preproduction(project, base_dir=None, *, image_backed_required=False, panels_per_sheet=8):
    errors = []
    if not isinstance(project, dict):
        return ['preproduction: project must be an object']
    package = project.get('preproduction')
    if not isinstance(package, dict):
        return ['preproduction: full-package declaration required']
    mode = package.get('mode')
    if mode not in ('text', 'image_backed'):
        errors.append('preproduction.mode: text or image_backed required')
    images = mode == 'image_backed'
    if image_backed_required and not images:
        errors.append('preproduction: image-backed review/execution cannot use text mode')
    base = Path(base_dir).resolve() if base_dir is not None else None
    if base is None:
        errors.append('preproduction: saved-package completeness requires --base-dir')

    def text(value):
        return isinstance(value, str) and bool(value.strip())

    def table(name):
        rows = project.get(name)
        return {row['id']: row for row in rows if isinstance(row, dict) and text(row.get('id'))} if isinstance(rows, list) else {}

    artifacts = table('artifacts')
    assets = table('asset_registry')
    characters = table('characters')
    shots = table('shots')
    decoded = set()

    def artifact(aid, kind, label):
        row = artifacts.get(aid) if isinstance(aid, str) else None
        if row is None or row.get('type') != kind:
            errors.append(f'preproduction {label}: {kind} artifact required')
            return None
        if row.get('status') == 'stale':
            errors.append(f'preproduction {label}: stale artifact {aid}')
        return row

    def dependency(row, aid, label):
        if row is None or not isinstance(aid, str) or aid not in artifacts:
            return
        deps, versions = row.get('dependencies'), row.get('dependency_versions')
        if not isinstance(deps, list) or aid not in deps:
            errors.append(f'preproduction {label}: missing dependency {aid}')
        elif not isinstance(versions, dict) or versions.get(aid) != artifacts[aid].get('version'):
            errors.append(f'preproduction {label}: stale dependency version {aid}')

    def file_asset(aid, label, *, kind=None, image=False, markdown=False):
        row = assets.get(aid) if isinstance(aid, str) else None
        if row is None:
            errors.append(f'preproduction {label}: registered asset required')
            return None
        if kind is not None and row.get('kind') != kind:
            errors.append(f'preproduction {label}: asset kind must be {kind}')
        if row.get('status') not in ('available', 'verified'):
            errors.append(f'preproduction {label}: actual available/verified asset required')
        digest = row.get('sha256')
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
            errors.append(f'preproduction {label}: actual asset SHA-256 required')
        path = row.get('path')
        if not text(path):
            errors.append(f'preproduction {label}: actual file path required')
            return row
        if base is None:
            return row
        try:
            resolved = (base / path).resolve()
            if not resolved.is_relative_to(base) or not resolved.is_file():
                errors.append(f'preproduction {label}: file missing or outside project root')
                return row
            if markdown:
                if resolved.suffix.lower() != '.md' or not resolved.read_text(encoding='utf-8').strip():
                    errors.append(f'preproduction {label}: nonempty Markdown file required')
            if image and resolved not in decoded:
                from PIL import Image
                with Image.open(resolved) as source:
                    source.load()
                decoded.add(resolved)
        except (OSError, ValueError, ImportError) as exc:
            errors.append(f'preproduction {label}: cannot read actual file: {exc}')
        return row

    def document(row, label):
        if row is None:
            return
        ids = row.get('asset_ids')
        if not isinstance(ids, list) or len(ids) != 1:
            errors.append(f'preproduction {label}: exactly one Markdown asset required')
            return
        file_asset(ids[0], label, markdown=True)

    synopsis_id = package.get('synopsis_artifact_id')
    synopsis = artifact(synopsis_id, 'synopsis', 'synopsis')
    document(synopsis, 'synopsis')
    board_id = package.get('storyboard_artifact_id')
    board = artifact(board_id, 'storyboard', 'storyboard')
    document(board, 'storyboard')
    dependency(board, synopsis_id, 'storyboard')
    sb = project.get('storyboard')
    if not isinstance(sb, dict) or sb.get('synopsis_artifact_id') != synopsis_id:
        errors.append('preproduction: storyboard must use the package synopsis')
    from validate_storyboard import validate_storyboard
    errors.extend(validate_storyboard(project, base_dir, images, check_project=False,
                                      panels_per_sheet=panels_per_sheet))

    for cid, character in characters.items():
        persona = character.get('persona')
        if not isinstance(persona, dict) or not all(text(persona.get(key)) for key in ('role', 'personality', 'observable_behavior', 'speech')):
            errors.append(f'preproduction {cid}: persona role/personality/observable_behavior/speech required')
        ssot_id = character.get('ssot_artifact_id')
        ssot = artifact(ssot_id, 'character_sheet', cid)
        document(ssot, f'{cid} SSOT')
        dependency(ssot, synopsis_id, f'{cid} SSOT')
        dependency(board, ssot_id, 'storyboard')
        if images:
            aid = character.get('identity_sheet_asset_id')
            sheet = file_asset(aid, f'{cid} identity sheet', kind='character_identity_sheet', image=True)
            ssot_assets = ssot.get('asset_ids') if isinstance(ssot, dict) else None
            source_ids = sheet.get('source_asset_ids') if isinstance(sheet, dict) else None
            if not isinstance(ssot_assets, list) or len(ssot_assets) != 1 \
                    or not isinstance(source_ids, list) or ssot_assets[0] not in source_ids:
                expected = ssot_assets[0] if isinstance(ssot_assets, list) and len(ssot_assets) == 1 else '?'
                errors.append(
                    f'preproduction {cid}: identity sheet must include SSOT source asset {expected}')
            if sheet is not None and (sheet.get('entity_type') != 'character' or sheet.get('entity_id') != cid):
                errors.append(f'preproduction {cid}: identity sheet must belong to the same character')
            for sid, shot in shots.items():
                ids = shot.get('character_ids')
                if isinstance(ids, list) and cid in ids:
                    refs = shot.get('asset_ids')
                    if not isinstance(refs, list) or aid not in refs:
                        errors.append(f'preproduction {sid}: missing character identity reference {cid}')

    required_review_inputs = [synopsis_id, board_id]
    if images:
        ids = package.get('storyboard_sheet_artifact_ids')
        if not isinstance(ids, list) or not ids or any(not isinstance(i, str) for i in ids):
            errors.append('preproduction combined storyboard sheets: ordered sheet artifact ids required')
            ids = []
        if len(set(ids)) != len(ids):
            errors.append('preproduction combined storyboard sheets: duplicate sheet artifact')
        panels = sb.get('panels') if isinstance(sb, dict) else None
        rows = [pn for pn in panels if isinstance(pn, dict)] if isinstance(panels, list) else []
        seen_panels = []
        for sheet_no, sheet_id in enumerate(ids, 1):
            label = f'combined storyboard sheet {sheet_id}'
            sheet = artifact(sheet_id, 'storyboard_sheet', label)
            dependency(sheet, board_id, label)
            asset_ids = sheet.get('asset_ids') if isinstance(sheet, dict) else None
            if not isinstance(asset_ids, list) or len(asset_ids) != 1:
                errors.append(f'preproduction {label}: exactly one actual image asset required')
                continue
            image = file_asset(asset_ids[0], label, kind='storyboard_sheet', image=True)
            if image is None:
                continue
            ids_panel = image.get('panel_ids')
            if not isinstance(ids_panel, list) or not all(isinstance(x, str) for x in ids_panel):
                errors.append(f'preproduction {label}: ordered panel_ids required')
                continue
            if not ids_panel:
                errors.append(f'preproduction {label}: empty sheet')
            if len(ids_panel) > 8:
                errors.append(f'preproduction {label}: more than 8 panels on one sheet')
            if len(ids) > 1:
                if image.get('sheet_index') != sheet_no or image.get('sheet_count') != len(ids):
                    errors.append(f'preproduction {label}: sheet_index/sheet_count mismatch')
            seen_panels.extend(ids_panel)
            by_id = {pn.get('id'): pn for pn in rows}
            subset = [by_id.get(x) for x in ids_panel]
            if any(pn is None for pn in subset):
                continue  # coverage/order check below reports the unknown panel
            sources = [pn.get('source_sheet_asset_id', pn.get('image_asset_id')) for pn in subset]
            if image.get('source_asset_ids') != sources:
                errors.append(f'preproduction {label}: source mapping does not match panels')
            expected_hashes = {sid: assets.get(sid, {}).get('sha256')
                               for sid in sources if isinstance(sid, str)}
            if image.get('source_sha256') != expected_hashes:
                errors.append(f'preproduction {label}: source hashes are stale or missing')
            for pn in subset:
                file_asset(pn.get('image_asset_id'), f'panel {pn.get("id")}', image=True)
                if pn.get('source_sheet_asset_id') is not None:
                    file_asset(pn['source_sheet_asset_id'], f'panel {pn.get("id")} crop source', image=True)
        if rows and seen_panels != [pn.get('id') for pn in rows]:
            errors.append('preproduction combined storyboard sheets: every panel must appear once in story order')
        required_review_inputs.extend(ids)
        split_id = package.get('storyboard_split_asset_id')
        split_asset = file_asset(split_id, 'storyboard split manifest',
                                 kind='storyboard_split_manifest')
        if split_asset is not None and base is not None:
            split_path = (base / split_asset['path']).resolve()
            if split_path.is_relative_to(base) and split_path.is_file():
                try:
                    manifest = json.loads(split_path.read_text(encoding='utf-8'))
                except (OSError, ValueError) as exc:
                    errors.append(f'preproduction storyboard split manifest: unreadable ({exc})')
                else:
                    expected = [pn.get('id') for pn in rows]
                    entries = manifest.get('entries') if isinstance(manifest, dict) else None
                    if not isinstance(entries, list) or [e.get('panel_id') for e in entries
                                                         if isinstance(e, dict)] != expected:
                        errors.append('preproduction storyboard split manifest: canonical panel order/coverage mismatch')
                    registered = {row.get('path'): row for row in assets.values()
                                  if isinstance(row.get('path'), str)}
                    for entry in (entries if isinstance(entries, list) else []):
                        if not isinstance(entry, dict):
                            errors.append('preproduction storyboard split manifest: malformed panel entry')
                            continue
                        output = (split_path.parent / str(entry.get('file', ''))).resolve()
                        if not output.is_relative_to(base) or not output.is_file():
                            errors.append(f'preproduction split panel {entry.get("panel_id")}: extracted file missing/outside')
                            continue
                        relative = output.relative_to(base).as_posix()
                        registered_asset = registered.get(relative)
                        if registered_asset is None or registered_asset.get('sha256') != entry.get('sha256'):
                            errors.append(f'preproduction split panel {entry.get("panel_id")}: extracted file registration/hash mismatch')
                        canonical = next((pn for pn in rows if pn.get('id') == entry.get('panel_id')), None)
                        shot = shots.get(canonical.get('shot_id')) if canonical else None
                        source = assets.get(canonical.get('source_sheet_asset_id')
                                            or canonical.get('image_asset_id')) if canonical else None
                        if (canonical is None or entry.get('shot_id') != canonical.get('shot_id')
                                or entry.get('scene_id') != (shot or {}).get('scene_id')
                                or entry.get('source_asset_id') != (source or {}).get('id')
                                or entry.get('source_asset_version') != (source or {}).get('version')
                                or entry.get('source_sha256') != (source or {}).get('sha256')):
                            errors.append(f'preproduction split panel {entry.get("panel_id")}: source/pin/scene mismatch')
                    scenes = manifest.get('scenes') if isinstance(manifest, dict) else None
                    expected_scenes = {shot.get('scene_id') for shot in shots.values()}
                    if not isinstance(scenes, list) or {row.get('scene_id') for row in scenes
                                                        if isinstance(row, dict)} != expected_scenes:
                        errors.append('preproduction storyboard split manifest: scene coverage mismatch')

    # Review may consume these through the sheet/board dependency chain.
    for rid, row in artifacts.items():
        if row.get('type') != 'preproduction_review' or row.get('status') not in ('reviewed', 'approved'):
            continue
        pending = list(row.get('dependencies', [])) if isinstance(row.get('dependencies'), list) else []
        seen = set()
        while pending:
            aid = pending.pop()
            if not isinstance(aid, str) or aid in seen or aid not in artifacts:
                continue
            seen.add(aid)
            deps = artifacts[aid].get('dependencies')
            if isinstance(deps, list):
                pending.extend(deps)
        for aid in required_review_inputs:
            if isinstance(aid, str) and aid not in seen:
                errors.append(f'preproduction {rid}: review does not consume package artifact {aid}')
    for issue in table('issues').values():
        if issue.get('severity') == 'blocker' and issue.get('status') != 'resolved':
            errors.append(f'preproduction: unresolved blocker {issue["id"]}')
    return errors
