#!/usr/bin/env python3
"""Assemble the v5.1 production asset package (directory or ZIP) from project.json.

Only registered available/verified assets with real files inside --base-dir are
copied. Every manifest is derived from the canonical ledger at packaging time;
no placeholder artifacts or empty rows are invented to look complete. Existing
output paths are never overwritten. Pass --require-final to refuse packaging
while the asset gate is open (unfinished, stale or drifting required assets).
"""
import argparse
import copy
import csv
import io
import json
import hashlib
import os
import re
import shutil
import zipfile
import tempfile
from pathlib import Path

from validate_project import validate

ENTITY_DEST = {
    'character': '02_MASTER_ASSETS/CHARACTERS',
    'wardrobe': '02_MASTER_ASSETS/CHARACTERS',
    'product': '02_MASTER_ASSETS/PRODUCTS',
    'prop': '02_MASTER_ASSETS/PROPS',
    'tool': '02_MASTER_ASSETS/TOOLS',
    'item': '02_MASTER_ASSETS/ITEMS',
    'vehicle': '02_MASTER_ASSETS/VEHICLES',
    'location': '02_MASTER_ASSETS/LOCATIONS',
    'environment': '02_MASTER_ASSETS/ENVIRONMENTS',
    'graphic': '02_MASTER_ASSETS/GRAPHICS',
    'look': '02_BIBLE',
    'lighting': '02_BIBLE',
}
ARTIFACT_DEST = {
    'synopsis': '01_SOURCE', 'script': '01_SOURCE', 'beat_map': '01_SOURCE',
    'adaptation_map': '01_SOURCE', 'style_world_bible': '02_BIBLE',
    'storyboard': '04_STORYBOARDS', 'storyboard_sheet': '04_STORYBOARDS',
    'shot_card': '05_SHOT_CARDS', 'generation_spec': '06_GENERATION_SPECS',
    'camera_spec': '05_SHOT_CARDS', 'spatial_spec': '05_SHOT_CARDS',
    'capture_spec': '06_GENERATION_SPECS', 'audio_map': '07_AUDIO',
    'voice_profile': '07_AUDIO', 'voice': '07_AUDIO', 'voice_recording': '07_AUDIO',
    'voiceover': '07_AUDIO', 'animatic': '08_ANIMATIC_EDIT', 'edit_plan': '08_ANIMATIC_EDIT',
    'edit_blueprint': '08_ANIMATIC_EDIT', 'qa_review': '09_QA', 'preproduction_review': '09_QA',
    'video_execution_plan': '09_QA', 'continuity_ledger': '00_MANIFEST',
    'delivery_spec': '10_DELIVERY',
}
PROVENANCE_FIELDS = ('source_type', 'source_reference', 'creation_tool', 'provider', 'model',
                     'model_version', 'workflow', 'generation_mode', 'prompt', 'negative_prompt',
                     'seed', 'aspect_ratio', 'resolution', 'created', 'creator', 'license_status')


def _project_file(base, raw, label):
    if not isinstance(raw, str) or not raw.strip() or Path(raw).is_absolute():
        raise ValueError(f'{label}: project-relative path required')
    candidate = base / raw
    current = base
    for part in Path(raw).parts:
        current = current / part
        if current.is_symlink() or (hasattr(current, 'is_junction') and current.is_junction()):
            raise ValueError(f'{label}: symlink or junction is not packageable: {current}')
    resolved = candidate.resolve()
    if resolved == base or base not in resolved.parents:
        raise ValueError(f'{label}: path escapes project root')
    return resolved


def table(project, key):
    return {row['id']: row for row in project.get(key, []) if isinstance(row, dict)
            and isinstance(row.get('id'), str)}



def asset_destination(asset, owners, artifacts):
    et = asset.get('entity_type')
    entity = asset.get('entity_id')
    if asset.get('kind') == 'style_world_bible' or et == 'look':
        return '02_BIBLE'
    if asset.get('role') == 'derivative':
        scene = asset.get('scene_id', 'UNASSIGNED')
        group = ENTITY_DEST.get(et, '02_MASTER_ASSETS/PROPS').rsplit('/', 1)[-1]
        return f'03_SCENE_PACKS/{scene}/{group}'
    if asset.get('kind') == 'storyboard_sheet':
        return '04_STORYBOARDS/sheets'
    for aid in owners.get(asset['id'], ()):
        atype = artifacts.get(aid, {}).get('type')
        if atype in ARTIFACT_DEST:
            return ARTIFACT_DEST[atype]
    if et in ENTITY_DEST:
        base = ENTITY_DEST[et]
        return f'{base}/{entity}' if entity else base
    if asset.get('kind') == 'document':
        return '00_MANIFEST/documents'
    return '04_STORYBOARDS/panels'


def csv_text(header, rows):
    out = io.StringIO()
    writer = csv.writer(out, lineterminator='\n')
    writer.writerow(header)
    writer.writerows(rows)
    return out.getvalue()


def build_package(project, base, dest_root, zip_path=None, require_final=False,
                  include_history=True):
    base = Path(base).resolve()
    if require_final and isinstance(project.get('preproduction'), dict):
        completeness = validate(project, 'preproduction', base_dir=base)
        if completeness:
            raise ValueError('full package is not ready: ' + '; '.join(completeness))
    if 'storyboard' in project:
        from validate_storyboard import validate_storyboard
        errors = validate_storyboard(project, base_dir=base, require_images=require_final)
    else:
        errors = validate(project, base_dir=base)
    if errors:
        raise ValueError('project ledger is not valid; fix before packaging: ' + '; '.join(errors))
    artifacts = table(project, 'artifacts')
    assets = table(project, 'asset_registry')
    scenes = table(project, 'scenes')
    shots = table(project, 'shots')
    panels = [row for row in project.get('storyboard', {}).get('panels', [])
              if isinstance(row, dict)]
    if require_final and panels:
        declaration = project.get('preproduction', {})
        if declaration.get('mode') != 'image_backed':
            raise ValueError('FINAL storyboard package requires image_backed preproduction')
        board_id = declaration.get('storyboard_artifact_id')
        selected = artifacts.get(board_id)
        if selected is None:
            boards = [a for a in artifacts.values() if a.get('type') == 'storyboard']
            selected = boards[0] if len(boards) == 1 else None
        if selected is None or selected.get('finality') != 'final' or selected.get('status') == 'stale':
            raise ValueError('FINAL package requires a current explicitly FINAL storyboard')
        split_id = declaration.get('storyboard_split_asset_id')
        split_asset = assets.get(split_id)
        if split_asset is None or split_asset.get('kind') != 'storyboard_split_manifest' \
                or split_asset.get('status') not in ('available', 'verified'):
        split_path = _project_file(base, split_asset.get('path'), 'split manifest')
        split = json.loads(split_path.read_text(encoding='utf-8'))
        if split.get('mode') != 'sheet' or split.get('project_id') != project.get('project_id'):
            raise ValueError('split manifest must derive from this project’s produced sheets')
        entries = split.get('entries', [])
        if [entry.get('panel_id') for entry in entries] != [panel.get('id') for panel in panels]:
            raise ValueError('split manifest must cover every panel once in canonical story order')
        for panel, entry in zip(panels, entries):
            shot = shots.get(panel.get('shot_id'))
            expected_source = panel.get('source_sheet_asset_id') or panel.get('image_asset_id')
            if (entry.get('panel_id') != panel.get('id')
                    or entry.get('shot_id') != panel.get('shot_id')
                    or entry.get('scene_id') != (shot or {}).get('scene_id')
                    or entry.get('source_asset_id') != expected_source):
                raise ValueError(f"split entry does not match canonical panel {panel.get('id')}")
            source = assets.get(expected_source)
            if (source is None
                    or entry.get('source_asset_version') != source.get('version')
                    or entry.get('source_sha256') != source.get('sha256')):
                raise ValueError(f"split source version/hash does not match {panel.get('id')}")
        registered = {}
        for asset in assets.values():
            if isinstance(asset.get('path'), str) and asset.get('status') in ('available', 'verified'):
                registered[_project_file(base, asset['path'], f"asset {asset.get('id')}")] = asset
        expected_sheets = []
        for sheet_id in declaration.get('storyboard_sheet_artifact_ids', []):
            for asset_id in artifacts[sheet_id].get('asset_ids', []):
                expected_sheets.append(assets[asset_id])
        observed_sheets = split.get('sheets', [])
        if [_project_file(base, item['path'], 'split sheet') for item in observed_sheets] != \
                [_project_file(base, item['path'], 'registered sheet') for item in expected_sheets]:
            raise ValueError('split manifest does not match the current ordered storyboard sheets')
        if [item.get('sha256') for item in observed_sheets] != \
                [item.get('sha256') for item in expected_sheets]:
            raise ValueError('split manifest references stale storyboard sheet hashes')
        for entry in entries + split.get('scenes', []):
            output = _project_file(base, os.path.relpath(
                split_path.parent / str(entry.get('file', '')), base), 'split output')
            asset = registered.get(output)
            if not output.is_relative_to(base) or asset is None or not output.is_file():
                raise ValueError('every split scene/panel image must exist and be registered')
            if asset.get('sha256') != entry.get('sha256'):
                raise ValueError('split image registration hash disagrees with the split manifest')
        expected_scenes = {shots[panel['shot_id']]['scene_id'] for panel in panels}
        if {scene.get('scene_id') for scene in split.get('scenes', [])} != expected_scenes:
            raise ValueError('split manifest must cover every storyboard scene')
        from PIL import Image, ImageChops
        for panel, entry in zip(panels, entries):
            sheet_path = _project_file(base, entry.get('sheet_path'), 'split panel sheet')
            if sheet_path not in [_project_file(base, row['path'], 'registered sheet')
                                  for row in expected_sheets]:
                raise ValueError(f"split panel {panel.get('id')} references an unregistered sheet")
            with Image.open(sheet_path) as sheet_image:
                trace_rows = json.loads(sheet_image.info.get('storyboard_sheet.panel_traceability', '[]'))
                bounds_rows = json.loads(sheet_image.info.get('storyboard_sheet.panel_bounds', '[]'))
                scene_rows = json.loads(sheet_image.info.get('storyboard_sheet.scene_bounds', '[]'))
                trace = [row for row in trace_rows if row.get('panel_id') == panel.get('id')]
                bounds = [row for row in bounds_rows if row.get('panel_id') == panel.get('id')]
                if len(trace) != 1 or len(bounds) != 1 or bounds[0].get('bounds') != entry.get('bounds'):
                    raise ValueError(f"split provenance or bounds do not match {panel.get('id')}")
                trace = trace[0]
                if (trace.get('source_asset_id') != entry.get('source_asset_id')
                        or trace.get('source_asset_version') != entry.get('source_asset_version')
                        or trace.get('asset_version_refs') != panel.get('asset_version_refs', {})
                        or trace.get('shot_id') != panel.get('shot_id')
                        or trace.get('scene_id') != shots[panel['shot_id']].get('scene_id')):
                    raise ValueError(f"split traceability does not match canonical panel {panel.get('id')}")
                l, t, r, b = entry['bounds']
                if not any(row.get('scene_id') == entry.get('scene_id')
                           and row['bounds'][0] <= l and row['bounds'][1] <= t
                           and row['bounds'][2] >= r and row['bounds'][3] >= b
                           for row in scene_rows):
                    raise ValueError(f"split panel bounds escape scene band: {panel.get('id')}")
                output_path = _project_file(base, os.path.relpath(
                    split_path.parent / entry['file'], base), 'split panel output')
                with Image.open(output_path) as extracted:
                    expected_crop = sheet_image.crop(tuple(entry['bounds']))
                    if ImageChops.difference(expected_crop.convert('RGBA'),
                                             extracted.convert('RGBA')).getbbox():
                        raise ValueError(f"split panel pixels do not match source sheet: {panel.get('id')}")
    owners = {}
    for aid, row in artifacts.items():
        for asset_id in row.get('asset_ids', []) or []:
            owners.setdefault(asset_id, set()).add(aid)
    gate_rows = []
    for aid, artifact in sorted(artifacts.items()):
        required = artifact.get('required_asset_versions')
        if not isinstance(required, dict):
            continue
        finality = artifact.get('finality', 'preliminary')
        for asset_id, expected in sorted(required.items()):
            asset = assets.get(asset_id)
            if asset is None:
                state, blocker = 'missing', 'required asset is not registered'
            elif asset.get('status') == 'stale':
                state, blocker = 'stale', 'required asset is stale'
            elif asset.get('status') != 'verified':
                state, blocker = asset.get('status', 'unknown'), 'asset is not locked (verified required)'
            elif asset.get('version') != expected:
                state, blocker = 'version_drift', f'pinned {expected} but registry has {asset.get("version")}'
            else:
                state, blocker = 'locked', ''
            gate_rows.append([aid, finality, asset_id, expected,
                              asset.get('version') if asset else '', state, blocker])
    from asset_gate import check_asset_gate
    gate_blockers = check_asset_gate(project)
    gate_open = bool(gate_blockers)
    if require_final and gate_open:
        raise ValueError('asset gate is open: ' + '; '.join(gate_blockers))
    copied = []
    skipped = []
    files = {}  # archive-relative path -> source Path or immutable bytes

    def add_bytes(relative, data):
        if relative in files:
            raise ValueError(f'generated package path collides with registered file: {relative}')
        files[relative] = data
    destinations = {}
    for aid, asset in sorted(assets.items()):
        if asset.get('status') not in ('available', 'verified'):
            skipped.append({'asset_id': aid, 'status': asset.get('status'),
                            'reason': 'only actual available/verified files are packaged'})
            continue
        path = asset.get('path')
        if not isinstance(path, str) or not path.strip():
            skipped.append({'asset_id': aid, 'status': asset.get('status'),
                            'reason': 'no registered file path'})
            continue
        resolved = _project_file(base, path, f'asset {aid}')
        if not resolved.is_file():
            skipped.append({'asset_id': aid, 'status': asset.get('status'),
                            'reason': 'registered file missing or outside project root'})
            continue
        normalized = str(path).replace('\\', '/')
        if re.match(r'^(?:00_MANIFEST|01_SOURCE|02_BIBLE|02_MASTER_ASSETS|03_SCENE_PACKS|'
                    r'04_STORYBOARDS|05_SHOT_CARDS|06_GENERATION_SPECS|07_AUDIO|'
                    r'08_ANIMATIC_EDIT|09_QA|10_DELIVERY)/', normalized):
            dest = normalized
        else:
            safe_id = re.sub(r'[^\w.-]', '_', aid)
            dest = f'{asset_destination(asset, owners, artifacts)}/{safe_id}_{resolved.name}'
        dest = dest.replace('\\', '/')
        if Path(dest).is_absolute() or '..' in dest.split('/') or re.match(r'^[A-Za-z]:', dest):
            raise ValueError(f'unsafe packaged asset path: {dest}')
        if dest in files:
            raise ValueError(f'packaged asset path collision: {dest}')
        files[dest] = resolved
        destinations[aid] = dest
        copied.append({'asset_id': aid, 'from': path, 'to': dest})
    rewritten_split_hash = None
    declaration = project.get('preproduction', {})
    split_asset_id = declaration.get('storyboard_split_asset_id') if isinstance(declaration, dict) else None
    if split_asset_id in destinations:
        split_asset = assets[split_asset_id]
        source_manifest = _project_file(base, split_asset.get('path'), 'split manifest')
        manifest = json.loads(source_manifest.read_text(encoding='utf-8'))
        original_manifest_dir = source_manifest.parent
        package_manifest = Path(destinations[split_asset_id])
        original_to_id = {
            (base / asset['path']).resolve(): asset_id
            for asset_id, asset in assets.items() if isinstance(asset.get('path'), str)}
        for sheet in manifest.get('sheets', []):
            source_path = _project_file(base, sheet.get('path'), 'split source sheet')
            source_id = original_to_id.get(source_path)
            if source_id not in destinations:
                raise ValueError(f"split source sheet is not being packaged: {sheet.get('path')}")
            sheet['path'] = destinations[source_id]
            sheet['sha256'] = assets[source_id].get('sha256')
        for group in ('entries', 'scenes'):
            for entry in manifest.get(group, []):
                old = (original_manifest_dir / entry['file']).resolve()
                source_id = original_to_id.get(old)
                if source_id not in destinations:
                    raise ValueError(f"split output is not registered for packaging: {entry['file']}")
                entry['file'] = Path(os.path.relpath(destinations[source_id],
                                                     package_manifest.parent)).as_posix()
                entry['sha256'] = assets[source_id].get('sha256')
        rewritten = json.dumps(manifest, ensure_ascii=False, indent=2)
        files[destinations[split_asset_id]] = rewritten
        rewritten_split_hash = hashlib.sha256(rewritten.encode('utf-8')).hexdigest()
    history_dir = base / '.history'
    if os.path.lexists(history_dir):
        _project_file(base, '.history', 'history directory')
    history_files = []
    if include_history and history_dir.is_dir():
        for entry in sorted(history_dir.rglob('*')):
            _project_file(base, entry.relative_to(base).as_posix(), 'history entry')
            if entry.is_file() and entry.name != 'writer.lock' and not entry.name.startswith('.'):
                relative = f'.history/{entry.relative_to(history_dir).as_posix()}'
                if relative in files:
                    raise ValueError(f'history path collision: {relative}')
                files[relative] = entry
                history_files.append(relative)
    snapshot = copy.deepcopy(project)
    for asset in snapshot.get('asset_registry', []):
        if asset.get('id') in destinations:
            asset['path'] = destinations[asset['id']]
            if rewritten_split_hash is not None and asset.get('id') == split_asset_id:
                asset['sha256'] = rewritten_split_hash
    add_bytes('project.json', json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')

    manifest_rows = []
    for aid, artifact in sorted(artifacts.items()):
        for asset_id in artifact.get('asset_ids', []) or []:
            item = next((c for c in copied if c['asset_id'] == asset_id), None)
            manifest_rows.append([aid, artifact.get('type', ''), artifact.get('version', ''),
                                  artifact.get('status', ''), asset_id,
                                  item['to'] if item else 'NOT_PACKAGED'])
    for entry in copied:
        if not any(row[4] == entry['asset_id'] for row in manifest_rows):
            manifest_rows.append(['', '', '', '', entry['asset_id'], entry['to']])
    provenance_rows = []
    prompt_rows = []
    for aid, asset in sorted(assets.items()):
        row = [aid, asset.get('version', ''), asset.get('kind', ''), asset.get('status', ''),
               asset.get('role', ''), (asset.get('master_asset_ref') or {}).get('asset_id', ''),
               (asset.get('master_asset_ref') or {}).get('version', '')]
        known = False
        for field in PROVENANCE_FIELDS:
            value = asset.get(field)
            if value is None:
                row.append('NOT_EXPOSED')
            else:
                known = True
                row.append(str(value))
        provenance_rows.append(row)
        if asset.get('prompt'):
            prompt_rows.append([aid, asset.get('version', ''), asset.get('provider', 'NOT_EXPOSED'),
                                asset.get('model', 'NOT_EXPOSED'),
                                asset.get('generation_mode', 'NOT_EXPOSED'),
                                asset.get('seed', 'NOT_EXPOSED'), asset.get('prompt', '')])
    scene_rows = [[sid, s.get('purpose', ''),
                   ','.join(k for k, v in sorted(shots.items()) if v.get('scene_id') == sid)]
                  for sid, s in sorted(scenes.items())]
    shot_rows = [[sid, s.get('scene_id', ''), s.get('start_s', ''), s.get('end_s', ''),
                  s.get('purpose', ''), ','.join(s.get('character_ids') or []),
                  ','.join(s.get('asset_ids') or []),
                  ','.join(s.get('beat_ids') or [])] for sid, s in sorted(shots.items())]
    panel_rows = []
    for pn in panels:
        avr = pn.get('asset_version_refs')
        refs = ';'.join(f'{k}_v{v}' for k, v in sorted(avr.items())) if isinstance(avr, dict) else ''
        panel_rows.append([pn.get('id', ''), pn.get('shot_id', ''), pn.get('role', ''),
                           pn.get('frame_time_s', ''), ','.join(pn.get('beat_ids') or []),
                           pn.get('image_asset_id', ''), refs])
    dep_rows = []
    for aid, artifact in sorted(artifacts.items()):
        for dep in artifact.get('dependencies', []) or []:
            dep_rows.append([dep, aid, 'artifact',
                             (artifact.get('dependency_versions') or {}).get(dep, '')])
        for asset_id, expected in sorted((artifact.get('required_asset_versions') or {}).items()):
            dep_rows.append([asset_id, aid, 'required_asset', expected])
    for aid, asset in sorted(assets.items()):
        reference = asset.get('master_asset_ref')
        if isinstance(reference, dict):
            dep_rows.append([reference.get('asset_id', ''), aid, 'master_derivative',
                             reference.get('version', '')])
    generation_rows = [[a.get('id', ''), a.get('shot_id', ''), a.get('attempt', ''),
                        a.get('route', ''), a.get('result', ''), a.get('result_asset_id', '')]
                       for a in project.get('generation_attempts', []) if isinstance(a, dict)]

    add_bytes('00_MANIFEST/asset_gate.csv',
              csv_text(['artifact_id', 'finality', 'required_asset_id', 'required_version',
                        'current_version', 'gate_state', 'blocker'], gate_rows))
    add_bytes('00_MANIFEST/asset_registry.csv',
              csv_text(['id', 'kind', 'version', 'status', 'role', 'entity_type', 'entity_id',
                        'path', 'sha256'],
                       [[aid, a.get('kind', ''), a.get('version', ''), a.get('status', ''),
                         a.get('role', ''), a.get('entity_type', ''), a.get('entity_id', ''),
                         destinations.get(aid, a.get('path', '')),
                         rewritten_split_hash if aid == split_asset_id and rewritten_split_hash
                         else a.get('sha256', '')]
                        for aid, a in sorted(assets.items())]))
    add_bytes('00_MANIFEST/asset_provenance.csv',
              csv_text(['asset_id', 'version', 'kind', 'status', 'role', 'master_asset_id',
                        'master_version'] + list(PROVENANCE_FIELDS), provenance_rows))
    if prompt_rows:
        add_bytes('00_MANIFEST/prompt_ledger.csv',
                  csv_text(['asset_id', 'version', 'provider', 'model', 'generation_mode',
                            'seed', 'prompt'], prompt_rows))
    if scene_rows:
        add_bytes('00_MANIFEST/scene_manifest.csv',
                  csv_text(['scene_id', 'purpose', 'shot_ids'], scene_rows))
    if shot_rows:
        add_bytes('00_MANIFEST/shot_manifest.csv',
                  csv_text(['shot_id', 'scene_id', 'start_s', 'end_s', 'purpose',
                            'character_ids', 'asset_ids', 'beat_ids'], shot_rows))
    if panel_rows:
        add_bytes('00_MANIFEST/storyboard_panel_manifest.csv',
                  csv_text(['panel_id', 'shot_id', 'role', 'frame_time_s', 'beat_ids',
                            'image_asset_id', 'asset_version_refs'], panel_rows))
    if dep_rows:
        add_bytes('00_MANIFEST/dependency_graph.csv',
                  csv_text(['upstream_id', 'downstream_id', 'edge_kind', 'pinned_version'], dep_rows))
    if generation_rows:
        add_bytes('00_MANIFEST/generation_status.csv',
                  csv_text(['attempt_id', 'shot_id', 'attempt', 'route', 'result',
                            'result_asset_id'], generation_rows))
    open_issues = sum(1 for i in project.get('issues', []) if isinstance(i, dict)
                      and i.get('severity') == 'blocker' and i.get('status') != 'resolved')
    gate_lines = ['# Production package QA report', '',
                  f"project: {project.get('project_id')} {project.get('version')}",
                  f'packaged assets: {len(copied)}', f'skipped assets: {len(skipped)}',
                  f'history entries: {len(history_files)}',
                  f'open blocker issues: {open_issues}',
                  f'asset gate: {"OPEN" if gate_open else "clear"}', '']
    for row in gate_rows:
        gate_lines.append(f'- {row[0]} ({row[1]}) requires {row[2]} v{row[3]}: {row[5]} {row[6]}')
    for blocker in gate_blockers:
        gate_lines.append(f'- BLOCKER: {blocker}')
    for item in skipped:
        gate_lines.append(f"- skipped {item['asset_id']} ({item['status']}): {item['reason']}")
    gate_lines += ['', 'Structural packaging report only; not media, identity, rights or approval verification.']
    add_bytes('00_MANIFEST/qa_report.md', '\n'.join(gate_lines) + '\n')
    add_bytes('00_MANIFEST/README.md',
              'Derived package manifest: regenerated from the canonical project.json at packaging '
              'time. Edit the ledger, not these copies.\n')

    for relative in sorted(files):
        if not any(row[5] == relative for row in manifest_rows):
            kind = 'audit_history' if relative.startswith('.history/') else 'derived_manifest'
            manifest_rows.append(['', kind, project.get('version', ''), 'generated', '', relative])
    manifest_rows.append(['', 'derived_manifest', project.get('version', ''), 'generated',
                          '', '00_MANIFEST/package_manifest.csv'])
    add_bytes('00_MANIFEST/package_manifest.csv',
              csv_text(['artifact_id', 'artifact_type', 'artifact_version', 'artifact_status',
                        'asset_id', 'packaged_path'], manifest_rows))
    version = str(project.get('version', '0')).removeprefix('v')
    root_name = f"{project.get('project_id', 'project')}_v{version}"
    root_name = re.sub(r'[^\w.-]+', '_', root_name)
    result = {'project_id': project.get('project_id'), 'version': project.get('version'),
              'packaged_assets': len(copied), 'skipped_assets': skipped,
              'history_entries': len(history_files), 'asset_gate': 'open' if gate_open else 'clear'}
    if zip_path is not None:
        zip_path = Path(zip_path).resolve()
        if zip_path.exists():
            raise ValueError(f'output exists; refusing to overwrite: {zip_path}')
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=zip_path.parent, prefix='.package-', suffix='.zip')
        os.close(fd)
        stage = Path(temporary)
        try:
            with zipfile.ZipFile(stage, 'w', zipfile.ZIP_DEFLATED) as archive:
                for relative, source in sorted(files.items()):
                    arcname = f'{root_name}/{relative}'
                    if isinstance(source, Path):
                        digest = hashlib.sha256()
                        with source.open('rb') as input_file, archive.open(arcname, 'w') as output_file:
                            for block in iter(lambda: input_file.read(1024 * 1024), b''):
                                digest.update(block)
                                output_file.write(block)
                        expected = next((asset.get('sha256') for asset in assets.values()
                                         if destinations.get(asset.get('id')) == relative), None)
                        if expected and digest.hexdigest() != expected:
                            raise ValueError(f'asset changed during package copy: {relative}')
                    else:
                        archive.writestr(arcname, source)
            os.link(stage, zip_path)
        finally:
            stage.unlink(missing_ok=True)
        result['package'] = str(zip_path)
    else:
        root = Path(dest_root).resolve() / root_name
        if root.exists():
            raise ValueError(f'output exists; refusing to overwrite: {root}')
        root.parent.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(dir=root.parent, prefix='.package-'))
        try:
            for relative, source in sorted(files.items()):
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                if isinstance(source, Path):
                    digest = hashlib.sha256()
                    with source.open('rb') as input_file, target.open('wb') as output_file:
                        for block in iter(lambda: input_file.read(1024 * 1024), b''):
                            digest.update(block)
                            output_file.write(block)
                    expected = next((asset.get('sha256') for asset in assets.values()
                                     if destinations.get(asset.get('id')) == relative), None)
                    if expected and digest.hexdigest() != expected:
                        raise ValueError(f'asset changed during package copy: {relative}')
                else:
                    target.write_text(source, encoding='utf-8')
            if root.exists():
                raise ValueError(f'output exists; refusing to overwrite: {root}')
            os.rename(stage, root)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
        result['package'] = str(root)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--base-dir', type=Path)
    parser.add_argument('--output', type=Path, required=True,
                        help='new output directory, or a new *.zip path with --zip')
    parser.add_argument('--zip', action='store_true')
    parser.add_argument('--require-final', action='store_true',
                        help='refuse packaging while the asset gate is open')
    parser.add_argument('--no-history', action='store_true',
                        help='exclude the .history audit directory')
    args = parser.parse_args()
    try:
        project_path = args.project.resolve()
        project = json.loads(project_path.read_text(encoding='utf-8'))
        base = (args.base_dir or project_path.parent).resolve()
        output = args.output.resolve()
        result = build_package(
            project, base, output,
            zip_path=output if args.zip else None,
            require_final=args.require_final,
            include_history=not args.no_history)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError) as exc:
        print(json.dumps({'error': str(exc)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
