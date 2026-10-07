#!/usr/bin/env python3
"""Coordinator-only validated upserts to an existing canonical project.json."""
import argparse
import copy
import json
import os
import tempfile
from pathlib import Path
from validate_project import validate

TABLES = ('scenes', 'characters', 'shots', 'claims', 'artifacts', 'asset_registry',
          'audio_cues', 'captions', 'generation_attempts', 'issues', 'delivery_checks')


def upsert(rows, changes, label):
    if not isinstance(rows, list) or not isinstance(changes, list):
        raise ValueError(f'{label}: records must be arrays')
    positions = {row['id']: i for i, row in enumerate(rows)}
    seen = set()
    for change in changes:
        if not isinstance(change, dict) or not isinstance(change.get('id'), str) or not change['id'].strip():
            raise ValueError(f'{label}: each update needs a nonempty id')
        rid = change['id']
        if rid in seen:
            raise ValueError(f'{label}: duplicate update id {rid}')
        seen.add(rid)
        if rid in positions:
            previous = rows[positions[rid]]
            merged = dict(previous, **change)
            if label in ('artifacts', 'asset_registry'):
                content_keys = (previous.keys() | merged.keys()) - {'status', 'approval', 'evidence'}
                content_changed = any(previous.get(k) != merged.get(k) for k in content_keys)
                if content_changed and previous.get('version') == merged.get('version'):
                    raise ValueError(f'{rid}: changed content needs a new version')
                if previous.get('version') != merged.get('version'):
                    if 'status' not in change:
                        merged['status'] = 'draft' if label == 'artifacts' else 'planned'
                    if 'approval' not in change:
                        merged.pop('approval', None)
            rows[positions[rid]] = merged
        else:
            positions[rid] = len(rows)
            rows.append(dict(change))
    return seen


def prepare_update(current, delta):
    allowed = {'project_id', 'base_version', 'version', 'input_versions', 'changes', 'storyboard', 'preproduction', 'owner_artifact_ids', 'project'}
    if not isinstance(delta, dict) or delta.keys() - allowed:
        raise ValueError('invalid update envelope or unsupported fields')
    if delta.get('project_id') != current.get('project_id') or delta.get('base_version') != current.get('version'):
        raise ValueError('project identity/base version changed; re-read before integrating')
    version = delta.get('version')
    if not isinstance(version, str) or not version.strip() or version == current['version']:
        raise ValueError('update needs a distinct nonempty project version')
    inputs = delta.get('input_versions', {})
    if not isinstance(inputs, dict):
        raise ValueError('input_versions must be an artifact-version map')
    previous_artifacts = {row['id']: row for row in current['artifacts']}
    for aid, expected in inputs.items():
        row = previous_artifacts.get(aid)
        if row is None or row.get('version') != expected or row.get('status') == 'stale':
            raise ValueError(f'{aid}: worker input changed or is stale')
    changes = delta.get('changes', {})
    if not isinstance(changes, dict) or changes.keys() - set(TABLES):
        raise ValueError('changes must contain supported canonical record tables only')
    result = copy.deepcopy(current)
    touched = {}
    for key, records in changes.items():
        result.setdefault(key, [])
        touched[key] = sorted(upsert(result[key], records, key))
    if 'storyboard' in delta:
        change = delta['storyboard']
        if not isinstance(change, dict) or change.keys() - {'synopsis_artifact_id', 'beats', 'panels'}:
            raise ValueError('unsupported storyboard update')
        target = result.setdefault('storyboard', {})
        if 'synopsis_artifact_id' in change:
            target['synopsis_artifact_id'] = change['synopsis_artifact_id']
        for key in ('beats', 'panels'):
            if key in change:
                target.setdefault(key, [])
                touched[f'storyboard.{key}'] = sorted(upsert(target[key], change[key], f'storyboard.{key}'))
    if 'preproduction' in delta:
        change = delta['preproduction']
        if not isinstance(change, dict) or change.keys() - {'mode', 'synopsis_artifact_id', 'storyboard_artifact_id', 'storyboard_sheet_artifact_ids', 'storyboard_split_asset_id'}:
            raise ValueError('unsupported preproduction update')
        result.setdefault('preproduction', {}).update(change)
    if 'project' in delta:
        change = delta['project']
        if not isinstance(change, dict) or change.keys() - {'look_asset_id'}:
            raise ValueError('unsupported project field update')
        result.update(change)
    if result == current:
        raise ValueError('update contains no record changes')
    artifacts = {row['id']: row for row in result['artifacts']}
    material_tables = set(TABLES) - {'artifacts', 'generation_attempts', 'issues', 'delivery_checks'}
    def content(rows):
        return [{k: v for k, v in row.items() if k not in ('status', 'evidence', 'approval')} for row in rows]
    material_changed = any(content(current.get(key, [])) != content(result.get(key, []))
                           for key in material_tables if key in changes) or current.get('storyboard') != result.get('storyboard') or current.get('preproduction') != result.get('preproduction') or current.get('look_asset_id') != result.get('look_asset_id')
    owners = delta.get('owner_artifact_ids', [])
    if not isinstance(owners, list) or any(not isinstance(aid, str) or aid not in artifacts for aid in owners):
        raise ValueError('owner_artifact_ids must reference assigned artifacts')
    if material_changed and not owners:
        raise ValueError('content-record changes need assigned owner_artifact_ids and versioned artifact updates')
    for aid in owners:
        if aid in previous_artifacts and artifacts[aid].get('version') == previous_artifacts[aid].get('version'):
            raise ValueError(f'{aid}: owning artifact must advance with its content records')
    reverse = {}
    pending = []
    for aid, row in artifacts.items():
        dependencies = row.get('dependencies', [])
        versions = row.get('dependency_versions', {})
        if not isinstance(dependencies, list) or any(not isinstance(d, str) or d not in artifacts for d in dependencies):
            raise ValueError(f'{aid}: dependencies must reference registered artifacts')
        if not isinstance(versions, dict):
            raise ValueError(f'{aid}: dependency_versions must be an object')
        old = previous_artifacts.get(aid)
        if row.get('status') == 'stale' or old is not None and old.get('version') != row.get('version'):
            pending.append(aid)
        for dependency in dependencies:
            reverse.setdefault(dependency, []).append(aid)
    # Asset lineage: a changed or stale master stales every derivative pinning
    # it, transitively; a required asset version drift stales pinning artifacts.
    registry = {row['id']: row for row in result.get('asset_registry', [])
                if isinstance(row, dict) and isinstance(row.get('id'), str)}
    previous_assets = {row['id']: row for row in current.get('asset_registry', [])
                       if isinstance(row, dict) and isinstance(row.get('id'), str)}
    asset_dependents = {}
    for rid, row in registry.items():
        reference = row.get('master_asset_ref')
        if isinstance(reference, dict) and isinstance(reference.get('asset_id'), str):
            asset_dependents.setdefault(reference['asset_id'], []).append(rid)
    asset_pending = [rid for rid, row in registry.items()
                     if row.get('status') == 'stale'
                     or previous_assets.get(rid, {}).get('version') != row.get('version')]
    stale_assets = set()
    while asset_pending:
        rid = asset_pending.pop()
        master = registry.get(rid)
        for child_id in asset_dependents.get(rid, []):
            child = registry[child_id]
            reference = child.get('master_asset_ref', {})
            if master is not None and (master.get('status') == 'stale'
                                       or reference.get('version') != master.get('version')):
                stale_assets.add(child_id)
                if child.get('status') != 'stale':
                    child['status'] = 'stale'
                    asset_pending.append(child_id)
    stale = set()
    for aid, row in artifacts.items():
        required = row.get('required_asset_versions')
        required = required if isinstance(required, dict) else {}
        panel_drift = (row.get('type') == 'storyboard' and
                       any(isinstance(panel, dict) and isinstance(panel.get('asset_version_refs'), dict)
                           and any(registry.get(asset_id, {}).get('version') != expected
                                   or registry.get(asset_id, {}).get('status') == 'stale'
                                   for asset_id, expected in panel['asset_version_refs'].items())
                           for panel in (result.get('storyboard', {}).get('panels', [])
                                         if isinstance(result.get('storyboard'), dict) else [])))
        drift = panel_drift or any(registry.get(asset_id, {}).get('version') != expected
                                   or registry.get(asset_id, {}).get('status') == 'stale'
                                   for asset_id, expected in required.items()
                                   if isinstance(asset_id, str))
        if drift and row.get('status') != 'stale':
            row['status'] = 'stale'
            stale.add(aid)
            pending.append(aid)
    while pending:
        aid = pending.pop()
        for child_id in reverse.get(aid, []):
            child = artifacts[child_id]
            if artifacts[aid].get('status') == 'stale' or child.get('dependency_versions', {}).get(aid) != artifacts[aid].get('version'):
                stale.add(child_id)
                if child.get('status') != 'stale':
                    child['status'] = 'stale'
                    pending.append(child_id)
    result['version'] = version
    touched['stale_asset_ids'] = sorted(stale_assets)
    return result, touched, sorted(stale)



def apply_update(project_path, delta):
    path = Path(project_path).resolve()
    if path.name != 'project.json' or not path.is_file():
        raise ValueError('select an existing canonical project.json; this command does not create projects')
    lock = path.with_name('.project.json.lock')
    try:
        descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as exc:
        raise ValueError('ledger is locked; do not retry or remove another writer\'s lock') from exc
    temporary = None
    try:
        original = path.read_bytes()
        current = json.loads(original.decode('utf-8'))
        if isinstance(current, dict) and 'storyboard' in current:
            from validate_storyboard import validate_storyboard
            errors = validate_storyboard(current, base_dir=path.parent)
        else:
            errors = validate(current, base_dir=path.parent)
        if errors:
            raise ValueError('existing ledger is structurally invalid: ' + '; '.join(errors))
        candidate, touched, stale = prepare_update(current, delta)
        if 'storyboard' in candidate:
            from validate_storyboard import validate_storyboard
            errors = validate_storyboard(candidate, base_dir=path.parent, check_project=False)
        else:
            errors = []
        errors.extend(validate(candidate, base_dir=path.parent))
        if errors:
            raise ValueError('candidate rejected: ' + '; '.join(errors))
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.project-', suffix='.tmp', delete=False) as output:
            temporary = Path(output.name)
            json.dump(candidate, output, ensure_ascii=False, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        if path.read_bytes() != original:
            raise ValueError('ledger changed outside the writer; re-read before integrating')
        os.replace(temporary, path)
        temporary = None
        return {'project_id': candidate['project_id'], 'version': candidate['version'],
                'updated_ids': touched, 'stale_artifact_ids': stale,
                'stale_asset_ids': touched['stale_asset_ids'], 'path': str(path)}
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        os.close(descriptor)
        lock.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--update', required=True, type=Path)
    args = parser.parse_args()
    try:
        delta = json.loads(args.update.read_text(encoding='utf-8'))
        print(json.dumps(apply_update(args.project, delta), ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError) as exc:
        print(json.dumps({'error': str(exc)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
