"""Consumer-visible scoped lookup, stale integration and persistence boundaries."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from test_validate_project import project
from test_validate_storyboard import board
from project_index import build_index
from update_project import apply_update, prepare_update


def delta(p, changes=None):
    return {'project_id': p['project_id'], 'base_version': p['version'], 'version': '2',
            'input_versions': {'A01': '1'},
            'changes': changes or {'artifacts': [{'id': 'A01', 'version': '2'}]}}


def chain():
    p = project()
    approval = {'by': 'fixture user', 'at': '2026-10-18', 'evidence': 'synthetic approval fixture'}
    # A generic version graph, not a completed media-package approval fixture.
    for aid, kind, parent in [('A02', 'storyboard', 'A01'), ('A03', 'qa_review', 'A02'),
                               ('A04', 'edit_plan', 'A03')]:
        p['artifacts'].append({'id': aid, 'type': kind, 'version': '1', 'status': 'approved',
                               'approval': dict(approval), 'dependencies': [parent],
                               'dependency_versions': {parent: '1'}})
    p['artifacts'].append({'id': 'A05', 'type': 'audio', 'version': '1', 'status': 'approved',
                           'approval': dict(approval), 'dependencies': [], 'dependency_versions': {}})
    return p


class IndexTests(unittest.TestCase):
    def test_shot_context_links_beats_panels_voice_sequence_music_and_source_assets(self):
        p = board()
        p['asset_registry'].append({'id': 'SOURCE', 'kind': 'image', 'version': '1', 'status': 'planned'})
        p['asset_registry'][0]['source_asset_ids'] = ['SOURCE']
        before = copy.deepcopy(p)
        result = build_index(p, ['SH01'])
        ids = lambda key: {row['id'] for row in result[key]}
        self.assertEqual(ids('shots'), {'SH01'})
        self.assertEqual(ids('characters'), {'CH01'})
        self.assertEqual(ids('audio_cues'), {'AU01'})
        self.assertEqual(ids('artifacts'), {'SYN', 'VO01'})
        self.assertEqual(ids('asset_registry'), {'IM01', 'IM02', 'SOURCE'})
        self.assertEqual({r['id'] for r in result['storyboard']['panels']}, {'P01', 'P02'})
        self.assertEqual({r['id'] for r in result['storyboard']['beats']}, {'B01'})
        self.assertEqual(p, before)
    def test_artifact_lookup_preserves_upstream_versions_without_loading_other_shots(self):
        p = chain()
        result = build_index(p, artifact_ids=['A03'])
        self.assertEqual(result['input_versions'], {'A01': '1', 'A02': '1', 'A03': '1'})
        self.assertEqual(result['shots'], [])
        self.assertNotIn('A05', result['input_versions'])
    def test_unknown_or_unbounded_focus_is_rejected(self):
        for shots, artifacts in [([], []), (['SH99'], []), ([], ['A99'])]:
            with self.subTest(shots=shots, artifacts=artifacts), self.assertRaises(ValueError):
                build_index(project(), shots, artifacts)


class LedgerUpdateTests(unittest.TestCase):
    def test_version_change_stales_dependents_and_preserves_independent_approval(self):
        p = chain()
        updated, _, stale = prepare_update(p, delta(p))
        self.assertEqual(stale, ['A02', 'A03', 'A04'])
        rows = {r['id']: r for r in updated['artifacts']}
        self.assertEqual(rows['A02']['dependency_versions'], {'A01': '1'})
        self.assertEqual(rows['A05'], p['artifacts'][-1])
        self.assertEqual(p['version'], '1')
    def test_same_batch_rebuild_cannot_hide_later_stale_transition(self):
        for reverse in (False, True):
            with self.subTest(reverse=reverse):
                p=chain()
                if reverse:p['artifacts'].reverse()
                update=delta(p,{'artifacts':[{'id':'A01','version':'2'},
                                             {'id':'A02','version':'2','status':'draft'},
                                             {'id':'A03','version':'2','status':'draft','dependency_versions':{'A02':'2'}}]})
                result,_,stale=prepare_update(p,update)
                self.assertEqual(stale,['A02','A03','A04'])
                rows={r['id']:r for r in result['artifacts']}
                self.assertEqual(rows['A03']['status'],'stale')
                self.assertEqual(rows['A05']['status'],'approved')
    def test_old_worker_input_base_or_same_content_version_is_rejected(self):
        p = project()
        bad = [dict(delta(p), base_version='old'), dict(delta(p), input_versions={'A01': 'old'}),
               delta(p, {'artifacts': [{'id': 'A01', 'type': 'new content type'}]})]
        for update in bad:
            with self.subTest(update=update), self.assertRaises(ValueError):
                prepare_update(p, update)
    def test_changed_content_needs_explicit_versioned_owner(self):
        p = project()
        update = delta(p, {'shots': [{'id': 'SH01', 'purpose': 'new purpose'}]})
        with self.assertRaisesRegex(ValueError, 'owner_artifact_ids'):
            prepare_update(p, update)
        update['owner_artifact_ids'] = ['A01']
        with self.assertRaisesRegex(ValueError, 'owning artifact must advance'):
            prepare_update(p, update)
        update['changes']['artifacts'] = [{'id': 'A01', 'version': '2'}]
        result, _, _ = prepare_update(p, update)
        self.assertEqual(result['shots'][0]['purpose'], 'new purpose')
    def test_stale_named_available_asset_with_missing_file_is_rejected_without_write(self):
        with tempfile.TemporaryDirectory() as temp:
            p = project()
            path = Path(temp) / 'project.json'
            path.write_text(json.dumps(p), encoding='utf-8')
            original = path.read_bytes()
            update = delta(p, {
                'asset_registry': [{'id': 'STALE_MISSING', 'kind': 'image', 'version': '1',
                                    'status': 'available', 'path': 'missing.png'}],
                'artifacts': [{'id': 'A01', 'version': '2'}]})
            update['owner_artifact_ids'] = ['A01']
            with self.assertRaisesRegex(ValueError, 'STALE_MISSING: local asset file missing'):
                apply_update(path, update)
            self.assertEqual(path.read_bytes(), original)

    def test_real_save_reload_and_invalid_candidate_preserves_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, 'project.json')
            p = chain();path.write_text(json.dumps(p), encoding='utf-8')
            outcome = apply_update(path, delta(p))
            loaded = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(loaded['version'], '2')
            self.assertEqual(outcome['stale_artifact_ids'], ['A02', 'A03', 'A04'])
            original = path.read_bytes()
            bad = {'project_id': loaded['project_id'], 'base_version': '2', 'version': '3',
                   'owner_artifact_ids': ['A01'], 'changes': {'shots': [{'id': 'SH01', 'scene_id': 'UNKNOWN'}],
                                                            'artifacts': [{'id': 'A01', 'version': '3'}]}}
            with self.assertRaisesRegex(ValueError, 'candidate rejected'):
                apply_update(path, bad)
            self.assertEqual(path.read_bytes(), original)
            self.assertFalse(Path(temp, '.project.json.lock').exists())
            self.assertEqual(list(Path(temp).glob('.project-*.tmp')), [])
    def test_existing_lock_is_not_removed_or_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, 'project.json');p = project()
            path.write_text(json.dumps(p), encoding='utf-8')
            lock = Path(temp, '.project.json.lock');lock.write_text('another writer', encoding='utf-8')
            original = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'locked'):
                apply_update(path, delta(p))
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(lock.read_text(encoding='utf-8'), 'another writer')
    def test_noncooperating_external_edit_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, 'project.json');p = project()
            path.write_text(json.dumps(p), encoding='utf-8')
            def external_edit(current, update):
                result = prepare_update(current, update)
                path.write_text('external editor contents', encoding='utf-8')
                return result
            with patch('update_project.prepare_update', side_effect=external_edit):
                with self.assertRaisesRegex(ValueError, 'changed outside'):
                    apply_update(path, delta(p))
            self.assertEqual(path.read_text(encoding='utf-8'), 'external editor contents')


if __name__ == '__main__':
    unittest.main()
