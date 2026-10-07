"""Consumer-visible completeness gates, not artwork quality assertions."""
import unittest
import copy
import hashlib
import tempfile
from pathlib import Path
from PIL import Image
from test_validate_storyboard import board
from project_index import build_index
from update_project import prepare_update
from test_validate_project import project
from validate_project import validate


def image_package(root):
    """Synthetic files exercise contracts, not rendered-character quality."""
    root = Path(root)
    p = board()
    def asset(aid, path, kind='document', **extra):
        row = {'id': aid, 'kind': kind, 'version': '1', 'status': 'available',
               'path': path, 'sha256': hashlib.sha256((root / path).read_bytes()).hexdigest(), **extra}
        p['asset_registry'].append(row)
        return row
    def doc(aid, path):
        (root / path).write_text('# Synthetic contract fixture\n', encoding='utf-8')
        asset(aid, path)
    def artifact(aid, kind, deps, assets):
        p['artifacts'].append({'id': aid, 'type': kind, 'version': '1', 'status': 'reviewed',
                               'dependencies': deps, 'dependency_versions': {d: '1' for d in deps},
                               'asset_ids': assets})
    doc('SYNMD', 'synopsis.md')
    next(a for a in p['artifacts'] if a['id'] == 'SYN')['asset_ids'] = ['SYNMD']
    for i, row in enumerate(p['asset_registry'][:5]):
        path = f'panel{i}.png'
        Image.new('RGB', (40, 24), (i * 40, 20, 80)).save(root / path)
        row.update(status='available', path=path, sha256=hashlib.sha256((root / path).read_bytes()).hexdigest())
    doc('CHARMD', 'character.md')
    artifact('CHAR', 'character_sheet', ['SYN'], ['CHARMD'])
    Image.new('RGB', (64, 64), 'gray').save(root / 'identity.png')
    asset('IDENTITY', 'identity.png', 'character_identity_sheet', entity_type='character',
          entity_id='CH01', source_asset_ids=['CHARMD'])
    p['characters'][0].update(persona={'role': 'protagonist', 'personality': 'cautious',
                                      'observable_behavior': 'checks before speaking', 'speech': 'measured'},
                               ssot_artifact_id='CHAR', identity_sheet_asset_id='IDENTITY')
    p['shots'][0]['asset_ids'] = ['IDENTITY']
    doc('BOARDMD', 'storyboard.md')
    artifact('BOARD', 'storyboard', ['SYN', 'CHAR'], ['BOARDMD'])
    Image.new('RGB', (200, 48), 'white').save(root / 'sheet.png')
    panels = p['storyboard']['panels']
    sources = [x['image_asset_id'] for x in panels]
    source_map = {a['id']: a['sha256'] for a in p['asset_registry'] if a['id'] in sources}
    asset('SHEETIMG', 'sheet.png', 'storyboard_sheet', panel_ids=[x['id'] for x in panels],
          source_asset_ids=sources, source_sha256=source_map)
    artifact('SHEET', 'storyboard_sheet', ['BOARD'], ['SHEETIMG'])
    p['preproduction'] = {'mode': 'image_backed', 'synopsis_artifact_id': 'SYN',
                          'storyboard_artifact_id': 'BOARD', 'storyboard_sheet_artifact_ids': ['SHEET']}
    return p


class PreproductionGateTests(unittest.TestCase):
    def test_reviewed_package_without_deliverables_is_not_ready(self):
        p = project()
        p['artifacts'].append({'id': 'REVIEW', 'type': 'preproduction_review',
                               'version': '1', 'status': 'reviewed',
                               'dependencies': [], 'dependency_versions': {}})
        errors = validate(p)
        self.assertTrue(any('preproduction' in e for e in errors), errors)

    def test_complete_package_and_review_are_structurally_valid(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            self.assertEqual(validate(p, 'preproduction', root), [])
            p['artifacts'].append({'id': 'REVIEW', 'type': 'preproduction_review', 'version': '1',
                                   'status': 'reviewed', 'dependencies': ['SHEET'],
                                   'dependency_versions': {'SHEET': '1'}})

            self.assertEqual(validate(p, base_dir=root), [])

    def test_missing_wrong_stale_or_incomplete_deliverables_block_review(self):
        cases = [
            ('persona', lambda p: p['characters'][0].pop('persona')),
            ('character_sheet', lambda p: p['characters'][0].update(ssot_artifact_id='VO01')),
            ('same character', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'IDENTITY').update(entity_id='CH02')),
            ('SSOT source', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'IDENTITY').update(source_asset_ids=[])),
            ('SSOT source', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'IDENTITY').update(source_asset_ids=['SYNMD'])),
            ('identity reference', lambda p: p['shots'][0].update(asset_ids=[])),
            ('Markdown', lambda p: next(a for a in p['artifacts'] if a['id'] == 'CHAR').update(asset_ids=['IDENTITY'])),
            ('story order', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG')['panel_ids'].reverse()),
            ('source mapping', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG').update(source_asset_ids=['IM01'])),
            ('source hashes', lambda p: next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG').update(source_sha256={})),
            ('stale', lambda p: next(a for a in p['artifacts'] if a['id'] == 'CHAR').update(status='stale')),
            ('dependency', lambda p: next(a for a in p['artifacts'] if a['id'] == 'BOARD').update(dependencies=['SYN'], dependency_versions={'SYN':'1'})),
            ('synopsis', lambda p: p['preproduction'].update(synopsis_artifact_id='VO01')),
            ('combined storyboard sheet', lambda p: p['preproduction'].pop('storyboard_sheet_artifact_ids')),
            ('blocker', lambda p: p['issues'].append({'id':'Q01','severity':'blocker','status':'open'})),
        ]
        with tempfile.TemporaryDirectory() as root:
            original = image_package(root)
            for fragment, change in cases:
                with self.subTest(case=fragment):
                    p = copy.deepcopy(original)
                    change(p)
                    self.assertTrue(any(fragment in e for e in validate(p, 'preproduction', root)))

    def test_actual_files_not_metadata_or_empty_documents_satisfy_package(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            (Path(root) / 'identity.png').write_bytes(b'not an image')
            self.assertTrue(any('cannot read actual file' in e for e in validate(p, 'preproduction', root)))
            (Path(root) / 'character.md').write_text('', encoding='utf-8')
            self.assertTrue(any('nonempty Markdown' in e for e in validate(p, 'preproduction', root)))

    def test_text_and_characterless_packages_keep_narrow_image_scope(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            p['preproduction']['mode'] = 'text'
            p['preproduction'].pop('storyboard_sheet_artifact_ids')
            p['characters'][0].pop('identity_sheet_asset_id')
            p['shots'][0]['asset_ids'] = []
            self.assertEqual(validate(p, 'preproduction', root), [])
            p['characters'] = []
            p['shots'][0]['character_ids'] = []
            p['asset_registry'] = [a for a in p['asset_registry'] if a['id'] != 'IDENTITY']
            p['shots'][0]['speech'][0].update(kind='narration',character_id=None,lip_sync='not_applicable')
            for pn in p['storyboard']['panels']:
                pn['visible_character_ids'] = []
            self.assertEqual(validate(p, 'preproduction', root), [])
            self.assertEqual(validate(project()), [])

    def test_image_backed_review_cannot_switch_to_text_to_skip_sheet(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            p['preproduction']['mode'] = 'text'
            p['artifacts'].append({'id': 'REVIEW', 'type': 'preproduction_review', 'version':'1',
                                   'status':'reviewed','dependencies':['SHEET'],'dependency_versions':{'SHEET':'1'}})
            self.assertTrue(any('cannot use text mode' in e for e in validate(p, base_dir=root)))

    def test_focused_shot_handoff_includes_persona_ssot_and_actual_identity_source(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            packet = build_index(p, ['SH01'])
            self.assertEqual(packet['characters'][0]['persona'], p['characters'][0]['persona'])
            self.assertEqual(packet['input_versions']['CHAR'], '1')
            self.assertIn('IDENTITY', {a['id'] for a in packet['asset_registry']})

    def test_package_header_updates_need_content_owner_and_invalidate_dependents(self):
        p = project()
        p['artifacts'].append({'id':'DEPENDENT','type':'review','version':'1','status':'reviewed',
                               'dependencies':['A01'],'dependency_versions':{'A01':'1'}})
        change = {'project_id':p['project_id'],'base_version':'1','version':'2',
                  'preproduction':{'mode':'text','synopsis_artifact_id':'A01'}, 'changes':{}}
        with self.assertRaisesRegex(ValueError, 'owner_artifact_ids'):
            prepare_update(p, change)
        change.update(owner_artifact_ids=['A01'],changes={'artifacts':[{'id':'A01','version':'2'}]})
        updated, _, stale = prepare_update(p, change)
        self.assertEqual(updated['preproduction'], change['preproduction'])
        self.assertEqual(stale, ['DEPENDENT'])


if __name__ == '__main__':
    unittest.main()
