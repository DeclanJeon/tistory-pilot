#!/usr/bin/env python3
"""Read-only stage context from project.json; never infer a stage or write a ledger."""
import argparse
import json
from pathlib import Path
from validate_project import validate


def build_index(project, shot_ids=(), artifact_ids=()):
    tables = {key: {row['id']: row for row in project.get(key, [])}
              for key in ('scenes', 'characters', 'shots', 'claims', 'artifacts',
                          'asset_registry', 'audio_cues', 'captions', 'generation_attempts')}
    shots = set(shot_ids)
    artifacts = set(artifact_ids)
    if not shots and not artifacts:
        raise ValueError('select at least one shot or artifact; full-project loading is not implicit')
    for key, ids in (('shots', shots), ('artifacts', artifacts)):
        unknown = ids - tables[key].keys()
        if unknown:
            raise ValueError(f'unknown {key}: {", ".join(sorted(unknown))}')
    scenes, characters, claims, assets, cues = set(), set(), set(), set(), set()
    for sid in shots:
        row = tables['shots'][sid]
        scenes.add(row['scene_id'])
        characters.update(row['character_ids'])
        claims.update(row.get('claim_ids', []))
        assets.update(row.get('asset_ids', []))
        cues.update(row.get('audio_cue_ids', []))
        spatial = row.get('spatial', {})
        if spatial.get('artifact_id'):
            artifacts.add(spatial['artifact_id'])
        for speech in row.get('speech', []):
            artifacts.add(speech['voice_artifact_id'])
    for cid, row in tables['claims'].items():
        if shots.intersection(row.get('shot_ids', [])):
            claims.add(cid)
    for cid, row in tables['audio_cues'].items():
        if row.get('shot_id') in shots or any(
                row['start_s'] < tables['shots'][sid]['end_s']
                and row['end_s'] > tables['shots'][sid]['start_s'] for sid in shots):
            cues.add(cid)
    for cid in cues:
        if tables['audio_cues'][cid].get('asset_id'):
            assets.add(tables['audio_cues'][cid]['asset_id'])
    captions = [row for row in tables['captions'].values() if row.get('shot_id') in shots or any(
        row['start_s'] < tables['shots'][sid]['end_s'] and row['end_s'] > tables['shots'][sid]['start_s']
        for sid in shots)]
    for row in captions:
        if row.get('asset_id'):
            assets.add(row['asset_id'])
    storyboard = project.get('storyboard', {})
    panels = [row for row in storyboard.get('panels', []) if row['shot_id'] in shots]
    beat_ids = {bid for sid in shots for bid in tables['shots'][sid].get('beat_ids', [])}
    beats = [row for row in storyboard.get('beats', []) if row['id'] in beat_ids]
    if shots and storyboard.get('synopsis_artifact_id'):
        artifacts.add(storyboard['synopsis_artifact_id'])
    for row in panels:
        assets.add(row['image_asset_id'])
        if row.get('source_sheet_asset_id'):
            assets.add(row['source_sheet_asset_id'])
        for asset_id in row.get('asset_version_refs', {}):
            assets.add(asset_id)
    for cid in characters:
        row = tables['characters'][cid]
        if row.get('ssot_artifact_id'):
            artifacts.add(row['ssot_artifact_id'])
        if row.get('identity_sheet_asset_id'):
            assets.add(row['identity_sheet_asset_id'])
    if shots and isinstance(project.get('look_asset_id'), str):
        assets.add(project['look_asset_id'])
    owners = {}
    for aid, row in tables['artifacts'].items():
        for asset in row.get('asset_ids', []):
            owners.setdefault(asset, set()).add(aid)
    pending_assets, pending_artifacts = list(assets), list(artifacts)
    seen_assets, seen_artifacts = set(), set()
    while pending_assets or pending_artifacts:
        while pending_assets:
            aid = pending_assets.pop()
            if aid in seen_assets:
                continue
            if aid not in tables['asset_registry']:
                raise ValueError(f'unknown asset_registry: {aid}')
            seen_assets.add(aid)
            row = tables['asset_registry'][aid]
            pending_assets.extend(row.get('source_asset_ids', []))
            master = row.get('master_asset_ref')
            if isinstance(master, dict) and isinstance(master.get('asset_id'), str):
                pending_assets.append(master['asset_id'])
            pending_artifacts.extend(owners.get(aid, ()))
        if pending_artifacts:
            aid = pending_artifacts.pop()
            if aid in seen_artifacts:
                continue
            if aid not in tables['artifacts']:
                raise ValueError(f'unknown artifacts: {aid}')
            seen_artifacts.add(aid)
            row = tables['artifacts'][aid]
            pending_artifacts.extend(row.get('dependencies', []))
            pending_assets.extend(row.get('asset_ids', []))
            for asset_id in row.get('required_asset_versions', {}):
                pending_assets.append(asset_id)
            if row.get('type') in ('storyboard', 'storyboard_sheet') \
                    and isinstance(project.get('look_asset_id'), str):
                pending_assets.append(project['look_asset_id'])
    select = lambda key, ids: [row for rid, row in tables[key].items() if rid in ids]
    return {
        'project': {key: project[key] for key in ('project_id', 'version', 'schema_version',
                   'target_duration_s', 'fps', 'aspect_ratio', 'audio_mode') if key in project},
        'focus': {'shot_ids': sorted(shots), 'artifact_ids': sorted(set(artifact_ids))},
        'input_versions': {aid: tables['artifacts'][aid]['version'] for aid in sorted(seen_artifacts)},
        'scenes': select('scenes', scenes), 'characters': select('characters', characters),
        'shots': select('shots', shots), 'claims': select('claims', claims),
        'artifacts': select('artifacts', seen_artifacts), 'asset_registry': select('asset_registry', seen_assets),
        'audio_cues': select('audio_cues', cues), 'captions': captions,
        'generation_attempts': [row for row in tables['generation_attempts'].values() if row['shot_id'] in shots],
        'storyboard': {'beats': beats, 'panels': panels},
        'limits': 'Derived read-only context; not an execution grant, full brief, automatic stage selection or media inspection.'
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--shot', action='append', default=[])
    parser.add_argument('--artifact', action='append', default=[])
    args = parser.parse_args()
    try:
        project = json.loads(args.project.read_text(encoding='utf-8'))
        if isinstance(project, dict) and 'storyboard' in project:
            from validate_storyboard import validate_storyboard
            errors = validate_storyboard(project, base_dir=args.project.resolve().parent)
        else:
            errors = validate(project, base_dir=args.project.resolve().parent)
        if errors:
            raise ValueError('; '.join(errors))
        result = build_index(project, args.shot, args.artifact)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError) as exc:
        print(json.dumps({'error': str(exc)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
