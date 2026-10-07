"""v5.1 asset-integrity gates: finality, lineage drift, multi-sheet, packaging.

Fixture bytes are synthetic contract fixtures, not rendered media samples.
"""
import copy
import csv
import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from PIL import Image
from test_validate_project import project
from test_validate_storyboard import board
from test_validate_preproduction import image_package
from package_production import build_package
from update_project import prepare_update
from validate_project import validate


def gate_project():
    """Plan-level project with a look, one master and one derivative asset."""
    p = project()
    p['asset_registry'] = [
        {'id': 'LOOK01', 'kind': 'document', 'version': '1', 'status': 'verified',
         'path': 'bible.md', 'entity_type': 'look', 'role': 'master'},
        {'id': 'CH01M', 'kind': 'image', 'version': '1', 'status': 'verified',
         'path': 'master.png', 'entity_type': 'character', 'role': 'master'},
        {'id': 'CH01D', 'kind': 'image', 'version': '1', 'status': 'verified',
         'path': 'state.png', 'entity_type': 'character', 'role': 'derivative',
         'master_asset_ref': {'asset_id': 'CH01M', 'version': '1'}},
    ]
    p['look_asset_id'] = 'LOOK01'
    return p


def final_board(p, required=None, finality='final', status='reviewed'):
    p['artifacts'].append({
        'id': 'BOARD', 'type': 'storyboard', 'version': '1', 'status': status,
        'finality': finality,
        'required_asset_versions': required if required is not None
        else {'CH01M': '1', 'CH01D': '1', 'LOOK01': '1'},
        'dependencies': [], 'dependency_versions': {}})
    return p


class FinalityGateTests(unittest.TestCase):
    def test_final_artifact_needs_locked_exact_version_assets(self):
        p = final_board(gate_project())
        self.assertEqual(validate(p), [])

    def test_final_rejects_draft_missing_and_version_drift(self):
        # validate() keeps declared-shape checks; lock/availability enforcement
        # lives in the gate so unrelated finality states do not block plan work.
        from asset_gate import check_asset_gate
        cases = [
            ('cannot be declared final', 'cannot be final', lambda p: p['artifacts'][-1].update(status='draft')),
            ('needs required_asset_versions', 'needs required_asset_versions', lambda p: p['artifacts'][-1].pop('required_asset_versions')),
            ('version drift', 'version drift', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'CH01M').update(version='2')),
            ('not registered', 'not registered', lambda p: p['artifacts'][-1]['required_asset_versions'].update(GONE='1')),
            ('is not locked', 'is not locked', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'CH01D').update(status='planned')),
            ('is not locked', 'is not locked', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'CH01M').update(status='available')),
            ('stale artifact', 'stale artifact', lambda p: p['artifacts'][-1].update(dependencies=['A01'], dependency_versions={'A01': '1'}, status='reviewed') or p['artifacts'][0].update(status='stale')),
        ]
        for validate_fragment, gate_fragment, change in cases:
            with self.subTest(fragment=validate_fragment):
                p = final_board(gate_project())
                change(p)
                self.assertTrue(any(validate_fragment in e or gate_fragment in e
                                    for e in validate(p) + check_asset_gate(p)),
                                validate(p) + check_asset_gate(p))

    def test_final_visual_board_requires_verified_pinned_active_look(self):
        from asset_gate import check_asset_gate
        p = final_board(gate_project())
        del p['look_asset_id']
        blockers = check_asset_gate(p)
        self.assertTrue(any('look_asset_id' in b for b in blockers), blockers)
        p = final_board(gate_project())
        p['artifacts'][-1]['required_asset_versions'].pop('LOOK01')
        self.assertTrue(any('must pin the active look' in b for b in check_asset_gate(p)))

    def test_transitive_dependency_chain_blocks_final(self):
        from asset_gate import check_asset_gate
        p = final_board(gate_project())
        p['artifacts'].append({'id': 'MID', 'type': 'document', 'version': '1',
                               'status': 'reviewed', 'dependencies': ['A01'],
                               'dependency_versions': {'A01': '1'}})
        p['artifacts'][-2].update(dependencies=['MID'], dependency_versions={'MID': '1'})
        p['artifacts'][0].update(status='draft')
        blockers = check_asset_gate(p)
        self.assertTrue(any('still a draft' in b for b in blockers), blockers)
        p['artifacts'][0].update(version='2')
        blockers = check_asset_gate(p)
        self.assertTrue(any('version drift' in b for b in blockers), blockers)

    def test_preliminary_board_keeps_unfinished_inputs(self):
        from asset_gate import check_asset_gate
        p = final_board(gate_project(), finality='preliminary')
        next(a for a in p['asset_registry'] if a['id'] == 'CH01D').update(status='planned')
        self.assertEqual(validate(p), [])
        self.assertEqual(check_asset_gate(p), [])
        p['artifacts'][-1]['finality'] = 'final'
        self.assertTrue(any('is not locked' in e for e in check_asset_gate(p)))

    def test_final_rejects_unavailable_active_look(self):
        from asset_gate import check_asset_gate
        p = final_board(gate_project())
        next(a for a in p['asset_registry'] if a['id'] == 'LOOK01').update(status='planned')
        self.assertTrue(any('active look' in e for e in check_asset_gate(p)))

    def test_look_must_reference_a_look_entity(self):
        p = gate_project()
        next(a for a in p['asset_registry'] if a['id'] == 'LOOK01').update(entity_type='prop')
        self.assertTrue(any('look asset' in e for e in validate(p)))
        p['look_asset_id'] = 'NOPE'
        self.assertTrue(any('unknown asset_registry' in e for e in validate(p)))

class AssetGateFunctionTests(unittest.TestCase):
    def test_clear_gate_returns_no_blockers(self):
        from asset_gate import check_asset_gate
        p = final_board(gate_project())
        self.assertEqual(check_asset_gate(p), [])

    def test_available_master_blocks_final_even_with_real_file(self):
        from asset_gate import check_asset_gate
        p = final_board(gate_project())
        next(a for a in p['asset_registry'] if a['id'] == 'CH01M').update(status='available')
        blockers = check_asset_gate(p)
        self.assertTrue(any('CH01M' in b and 'not locked' in b for b in blockers), blockers)

    def test_scoped_gate_ignores_unrelated_final_artifacts(self):
        from asset_gate import check_asset_gate
        p = final_board(gate_project())
        p['artifacts'].append({'id': 'ANIM', 'type': 'animatic', 'version': '1',
                               'status': 'reviewed', 'finality': 'final',
                               'required_asset_versions': {'GONE': '1'},
                               'dependencies': [], 'dependency_versions': {}})
        self.assertTrue(any('GONE' in b for b in check_asset_gate(p)))
        self.assertEqual(check_asset_gate(p, ['BOARD']), [])
        self.assertTrue(any('not registered' in b for b in check_asset_gate(p, ['NOPE'])))


class LineageTests(unittest.TestCase):
    def test_derivative_must_pin_current_master_version(self):
        p = gate_project()
        next(a for a in p['asset_registry'] if a['id'] == 'CH01M').update(version='2')
        self.assertTrue(any('master version drift' in e for e in validate(p)))

    def test_stale_derivative_may_keep_older_pin(self):
        p = gate_project()
        next(a for a in p['asset_registry'] if a['id'] == 'CH01M').update(version='2')
        next(a for a in p['asset_registry'] if a['id'] == 'CH01D').update(status='stale')
        self.assertFalse(any('master version drift' in e for e in validate(p)), validate(p))

    def test_derivative_cannot_derive_from_stale_master(self):
        p = gate_project()
        next(a for a in p['asset_registry'] if a['id'] == 'CH01M').update(status='stale')
        self.assertTrue(any('derives from stale master' in e for e in validate(p)))

    def test_final_gate_rejects_unverified_ancestor_through_verified_derivative(self):
        from asset_gate import check_asset_gate
        p = gate_project()
        master = next(a for a in p['asset_registry'] if a['id'] == 'CH01M')
        next(a for a in p['asset_registry'] if a['id'] == 'CH01D').update(
            master_asset_ref={'asset_id': 'CH01M', 'version': '1'})
        p['asset_registry'].append({
            'id': 'CH01D2', 'kind': 'image', 'version': '1', 'status': 'verified',
            'role': 'derivative', 'master_asset_ref': {'asset_id': 'CH01D', 'version': '1'}})
        master.update(status='planned')
        final_board(p, required={'CH01D2': '1', 'LOOK01': '1'})
        blockers = check_asset_gate(p)
        self.assertTrue(any('master asset CH01M is not verified' in item for item in blockers))
        master.update(status='verified')
        self.assertEqual(check_asset_gate(p), [])

    def test_master_change_stales_derivatives_and_dependents_not_unrelated(self):
        p = final_board(gate_project())
        p['artifacts'].append({'id': 'AUDIO', 'type': 'audio_map', 'version': '1',
                               'status': 'approved',
                               'approval': {'by': 't', 'at': '2026', 'evidence': 'x'},
                               'dependencies': [], 'dependency_versions': {}})
        for aid, kind, parent in [('SHEET', 'storyboard_sheet', 'BOARD'),
                                  ('GEN', 'generation_spec', 'SHEET'),
                                  ('ANIMATIC', 'animatic', 'GEN')]:
            p['artifacts'].append({'id': aid, 'type': kind, 'version': '1',
                                   'status': 'reviewed', 'dependencies': [parent],
                                   'dependency_versions': {parent: '1'}})
        delta = {'project_id': p['project_id'], 'base_version': p['version'], 'version': '2',
                 'changes': {'asset_registry': [{'id': 'CH01M', 'version': '2'}]},
                 'owner_artifact_ids': ['A01'],
                 }
        delta['changes']['artifacts'] = [{'id': 'A01', 'version': '2'}]
        updated, touched, stale = prepare_update(p, delta)
        rows = {a['id']: a for a in updated['asset_registry']}
        self.assertEqual(rows['CH01D']['status'], 'stale')
        self.assertEqual(touched['stale_asset_ids'], ['CH01D'])
        arts = {a['id']: a for a in updated['artifacts']}
        self.assertEqual(arts['BOARD']['status'], 'stale')     # required asset pin drifted
        self.assertEqual(stale, ['ANIMATIC', 'BOARD', 'GEN', 'SHEET'])
        self.assertTrue(all(arts[aid]['status'] == 'stale' for aid in stale))
        self.assertEqual(arts['AUDIO']['status'], 'approved')  # unrelated downstream stays valid

    def test_retired_master_stales_whole_derivative_chain(self):
        p = final_board(gate_project())
        delta = {'project_id': p['project_id'], 'base_version': p['version'], 'version': '2',
                 'changes': {'asset_registry': [{'id': 'CH01M', 'status': 'stale'}]},
                 'owner_artifact_ids': ['A01'],
                 }
        delta['changes']['artifacts'] = [{'id': 'A01', 'version': '2'}]
        updated, touched, stale = prepare_update(p, delta)
        self.assertEqual(touched['stale_asset_ids'], ['CH01D'])
        arts = {a['id']: a for a in updated['artifacts']}
        self.assertEqual(arts['BOARD']['status'], 'stale')


class ProvenanceTests(unittest.TestCase):
    def test_unknown_and_not_exposed_are_valid_provenance_values(self):
        p = project()
        p['asset_registry'] = [{'id': 'IM01', 'kind': 'image', 'version': '1',
                                'status': 'planned', 'prompt': 'real prompt',
                                'provider': 'UNKNOWN', 'seed': 'NOT_EXPOSED',
                                'generation_mode': 'image'}]
        self.assertEqual(validate(p), [])
        p['asset_registry'][0]['prompt'] = ''
        self.assertTrue(any('prompt' in e for e in validate(p)))
        p['asset_registry'][0].update(prompt='real prompt', seed={})
        self.assertTrue(any('seed' in e for e in validate(p)))


class MultiSheetTests(unittest.TestCase):
    def two_sheets(self, root):
        p = image_package(root)
        root = Path(root)
        panels = p['storyboard']['panels']
        groups = (panels[:3], panels[3:])
        for index, group in enumerate(groups, 1):
            name = f'sheet{index}.png'
            Image.new('RGB', (200, 48), 'white').save(root / name)
            sources = [x.get('source_sheet_asset_id', x['image_asset_id']) for x in group]
            source_map = {a['id']: a['sha256'] for a in p['asset_registry'] if a['id'] in sources}
            asset_id = f'SHEETIMG{index}'
            digest = hashlib.sha256((root / name).read_bytes()).hexdigest()
            p['asset_registry'].append({
                'id': asset_id, 'kind': 'storyboard_sheet', 'version': '1',
                'status': 'available', 'path': name, 'sha256': digest,
                'panel_ids': [x['id'] for x in group],
                'sheet_index': index, 'sheet_count': 2,
                'source_asset_ids': sources, 'source_sha256': source_map})
            p['artifacts'].append({
                'id': f'SHEET{index}', 'type': 'storyboard_sheet', 'version': '1',
                'status': 'reviewed',
                'dependencies': ['BOARD'], 'dependency_versions': {'BOARD': '1'},
                'asset_ids': [asset_id]})
        p['asset_registry'] = [a for a in p['asset_registry'] if a['id'] != 'SHEETIMG']
        p['artifacts'] = [a for a in p['artifacts'] if a['id'] != 'SHEET']
        p['preproduction']['storyboard_sheet_artifact_ids'] = ['SHEET1', 'SHEET2']
        return p

    def test_ordered_multi_sheet_package_is_valid(self):
        with tempfile.TemporaryDirectory() as root:
            p = self.two_sheets(root)
            self.assertEqual(validate(p, 'preproduction', root), [])

    def test_sheet_order_gaps_and_duplicates_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            good = self.two_sheets(root)
            p = copy.deepcopy(good)
            p['preproduction']['storyboard_sheet_artifact_ids'] = ['SHEET2', 'SHEET1']
            self.assertTrue(any('story order' in e for e in validate(p, 'preproduction', root)))
            p = copy.deepcopy(good)
            next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG2')['panel_ids'] = ['P04']
            self.assertTrue(validate(p, 'preproduction', root))
            p = copy.deepcopy(good)
            next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG1').update(sheet_index=2)
            self.assertTrue(any('sheet_index' in e for e in validate(p, 'preproduction', root)))

    def test_more_than_eight_panels_on_one_sheet_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            p = self.two_sheets(root)
            all_ids = [x['id'] for x in p['storyboard']['panels']]
            next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG1')['panel_ids'] = all_ids * 2
            self.assertTrue(any('8 panels' in e for e in validate(p, 'preproduction', root)))

    def test_single_sheet_uses_the_same_ordered_declaration(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            self.assertEqual(validate(p, 'preproduction', root), [])


class PackagingTests(unittest.TestCase):
    def final_package(self, root):
        from render_storyboard_sheet import render_sheets, resolve_font
        from split_storyboard import split_storyboard
        try:
            font = resolve_font()[1]
        except ValueError as exc:
            self.skipTest(str(exc))
        p = image_package(root)
        look = Path(root) / 'look.md'
        look.write_text('# Synthetic LOOK\n', encoding='utf-8')
        p['asset_registry'].append({'id': 'LOOK', 'kind': 'style_world_bible',
                                   'version': '1', 'status': 'verified', 'path': look.name,
                                   'sha256': hashlib.sha256(look.read_bytes()).hexdigest()})
        p['look_asset_id'] = 'LOOK'
        next(a for a in p['asset_registry'] if a['id'] == 'IDENTITY')['status'] = 'verified'
        next(a for a in p['artifacts'] if a['id'] == 'BOARD').update(
            finality='final', required_asset_versions={'LOOK': '1', 'IDENTITY': '1'})
        shots = {s['id']: s for s in p['shots']}
        for panel in p['storyboard']['panels']:
            panel['asset_version_refs'] = {
                aid: '1' for aid in shots[panel['shot_id']].get('asset_ids', []) + ['LOOK']}
        sheet = render_sheets(p, root, '04_STORYBOARDS/sheets/final.png', font_path=font)['sheets'][0]
        current = next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG')
        current.update(path=Path(sheet['relative_path']).as_posix(), sha256=sheet['sha256'],
                       panel_ids=sheet['panel_ids'], source_asset_ids=sheet['source_asset_ids'],
                       source_sha256=sheet['source_sha256'])
        folder = Path(root) / '04_STORYBOARDS/extracts'
        split_storyboard(p, root, folder, [sheet['relative_path']])
        for i, file in enumerate(sorted(folder.rglob('*'))):
            if not file.is_file():
                continue
            manifest = file.name == 'split-manifest.json'
            aid = 'SPLIT' if manifest else f'EXTRACT{i}'
            p['asset_registry'].append({
                'id': aid, 'kind': 'storyboard_split_manifest' if manifest else 'image',
                'version': '1', 'status': 'available', 'path': file.relative_to(root).as_posix(),
                'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
        p['preproduction']['storyboard_split_asset_id'] = 'SPLIT'
        return p

    def test_final_package_requires_registered_current_scene_panel_outputs(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            p = self.final_package(root)
            result = build_package(p, Path(root), Path(out), require_final=True)
            exported = Path(result['package'])
            snapshot = json.loads((exported / 'project.json').read_text(encoding='utf-8'))
            self.assertEqual(validate(snapshot, 'preproduction', exported), [])
            for mutation, message in (
                (lambda q: q['preproduction'].pop('storyboard_split_asset_id'), 'split manifest'),
                (lambda q: q['asset_registry'].__setitem__(slice(None), [
                    a for a in q['asset_registry'] if not a['id'].startswith('EXTRACT')]),
                 'must exist and be registered'),
            ):
                with self.subTest(message=message):
                    candidate = copy.deepcopy(p)
                    mutation(candidate)
                    with self.assertRaisesRegex(ValueError, message):
                        build_package(candidate, Path(root), Path(out), require_final=True)

    def test_directory_package_reopens_as_a_portable_ledger(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            p = image_package(root)
            package = build_package(p, Path(root), Path(out))
            root_dir = Path(package['package'])
            snapshot = json.loads((root_dir / 'project.json').read_text(encoding='utf-8'))
            self.assertEqual(validate(snapshot, 'preproduction', root_dir), [])
            originals = {a['id']: a for a in p['asset_registry']}
            for asset in snapshot['asset_registry']:
                self.assertEqual((root_dir / asset['path']).read_bytes(),
                                 (Path(root) / originals[asset['id']]['path']).read_bytes())
            rows = csv.DictReader(io.StringIO(
                (root_dir / '00_MANIFEST' / 'package_manifest.csv').read_text(encoding='utf-8')))
            self.assertEqual({r['packaged_path'] for r in rows},
                             {f.relative_to(root_dir).as_posix()
                              for f in root_dir.rglob('*') if f.is_file()})
            before = (root_dir / 'project.json').read_bytes()
            with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
                build_package(p, Path(root), Path(out))
            self.assertEqual((root_dir / 'project.json').read_bytes(), before)

    def test_zip_roundtrip_preserves_registered_bytes_and_history(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            p = image_package(root)
            (Path(root) / '.history').mkdir()
            (Path(root) / '.history' / '2026-10-06.md').write_text('# event\n', encoding='utf-8')
            target = Path(out) / 'pkg.zip'
            package = build_package(p, Path(root), target, zip_path=target)
            with zipfile.ZipFile(target) as archive:
                names = archive.namelist()
                ledger_name = next(n for n in names if n.endswith('/project.json'))
                prefix = ledger_name.removesuffix('project.json')
                snapshot = json.loads(archive.read(ledger_name))
                originals = {a['id']: a for a in p['asset_registry']}
                for asset in snapshot['asset_registry']:
                    self.assertEqual(archive.read(prefix + asset['path']),
                                     (Path(root) / originals[asset['id']]['path']).read_bytes())
                self.assertEqual(archive.read(prefix + '.history/2026-10-06.md'),
                                 (Path(root) / '.history/2026-10-06.md').read_bytes())
                with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
                    build_package(p, Path(root), target, zip_path=target)

    def test_equal_basenames_keep_distinct_registered_assets(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            p = image_package(root)
            for asset_id, folder in [('IM01', 'first'), ('IM02', 'second')]:
                asset = next(a for a in p['asset_registry'] if a['id'] == asset_id)
                destination = Path(root) / folder / 'same.png'
                destination.parent.mkdir()
                destination.write_bytes((Path(root) / asset['path']).read_bytes())
                asset['path'] = f'{folder}/same.png'
            result = build_package(p, Path(root), Path(out))
            exported = Path(result['package'])
            assets = {a['id']: a for a in json.loads(
                (exported / 'project.json').read_text(encoding='utf-8'))['asset_registry']}
            self.assertNotEqual(assets['IM01']['path'], assets['IM02']['path'])
            self.assertNotEqual((exported / assets['IM01']['path']).read_bytes(),
                                (exported / assets['IM02']['path']).read_bytes())

    def test_require_final_refuses_open_gate(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            p = image_package(root)
            p['artifacts'].append({
                'id': 'FIN', 'type': 'storyboard', 'version': '1', 'status': 'reviewed',
                'finality': 'final', 'required_asset_versions': {'MISSING': '1'},
                'dependencies': [], 'dependency_versions': {}})
            with self.assertRaises(ValueError):
                build_package(p, Path(root), Path(out), require_final=True)


if __name__ == '__main__':
    unittest.main()
