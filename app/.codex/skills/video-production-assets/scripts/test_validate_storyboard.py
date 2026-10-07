"""Storyboard contract regressions; fixture bytes are NOT a rendered media sample."""
import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from test_validate_project import project
from validate_project import validate
from validate_storyboard import validate_storyboard


def shot(shot_id, start, end, beats, chars=(), speech=(), cues=(),
         start_state='test state', end_state='test end state'):
    return {'id': shot_id, 'scene_id': 'S01', 'character_ids': list(chars),
            'start_s': start, 'end_s': end, 'source_duration_s': end - start,
            'source_duration_status': 'estimated',
            'purpose': 'test purpose', 'start_state': start_state, 'end_state': end_state,
            'beat_ids': list(beats),
            'camera': {'shot_size': 'medium', 'angle': 'eye level', 'framing': 'center',
                       'movement': 'static', 'start': 'test framing start', 'end': 'test framing end'},
            'spatial': {'mode': 'not_applicable', 'reason': 'no numeric spatial requirement'},
            'vfx': {'enabled': False, 'description': 'no vfx'},
            'speech': list(speech), 'audio_cue_ids': list(cues)}


def panel(panel_id, shot_id, frame, role, image, beats=(), characters=(), cues=(), speech=()):
    return {'id': panel_id, 'shot_id': shot_id, 'frame_time_s': frame, 'role': role,
            'beat_ids': list(beats), 'visible_character_ids': list(characters),
            'audio_cue_ids': list(cues), 'speech_ids': list(speech),
            'visual_action': 'test action', 'reveals': 'test reveal',
            'withholds': 'none', 'continuity': 'test continuity', 'image_asset_id': image}


def board():
    """A complete valid production board: 2 shots, 3 synopsis beats, 24 fps."""
    p = project()
    p['audio_mode'] = 'dialogue'
    p['target_duration_s'] = 4
    p['characters'] = [{'id': 'CH01', 'locked_traits': {'trait': 'test fixture'}}]
    p['artifacts'] = [
        {'id': 'A01', 'type': 'plan', 'version': '1', 'status': 'draft',
         'dependencies': [], 'dependency_versions': {}},
        {'id': 'SYN', 'type': 'synopsis', 'version': '1', 'status': 'approved',
         'approval': {'by': 'test user', 'at': '2026-10-04', 'evidence': 'test approval record'},
         'dependencies': [], 'dependency_versions': {}},
        {'id': 'VO01', 'type': 'voice_profile', 'version': '1', 'status': 'draft',
         'dependencies': [], 'dependency_versions': {}}]
    # Sequence BGM spanning both shots must be linked from each overlapping shot.
    p['audio_cues'] = [{'id': 'AU01', 'start_s': 0, 'end_s': 4, 'layer': 'music'}]
    p['asset_registry'] = [{'id': a, 'kind': 'image', 'version': '1', 'status': 'planned'}
                           for a in ('IM01', 'IM02', 'IM03', 'IM04', 'IM05')]
    p['shots'] = [
        shot('SH01', 0, 2, ('B01',), chars=('CH01',), cues=('AU01',), speech=(
            {'id': 'SP01', 'kind': 'dialogue', 'character_id': 'CH01', 'text': 'test line',
             'start_s': 0, 'end_s': 1, 'voice_artifact_id': 'VO01',
             'lip_sync': 'required', 'performance': 'flat'},)),
        shot('SH02', 2, 4, ('B02', 'B03'), cues=('AU01',), speech=(
            {'id': 'SP02', 'kind': 'narration', 'character_id': None, 'text': 'test narration',
             'start_s': 2, 'end_s': 3, 'voice_artifact_id': 'VO01',
             'lip_sync': 'not_applicable', 'performance': 'calm'},))]
    p['storyboard'] = {
        'synopsis_artifact_id': 'SYN',
        'beats': [{'id': b, 'synopsis_locator': f'paragraph {i + 1}',
                   'event': f'test event {i + 1}', 'emotion': f'test emotion {i + 1}'}
                  for i, b in enumerate(('B01', 'B02', 'B03'))],
        'panels': [panel('P01', 'SH01', 0, 'start', 'IM01'),
                   panel('P02', 'SH01', 47 / 24, 'end', 'IM02'),
                   panel('P03', 'SH02', 2, 'start', 'IM03'),
                   panel('P04', 'SH02', 3, 'action_peak', 'IM04'),
                   panel('P05', 'SH02', 95 / 24, 'end', 'IM05')]}
    panel_links = {
        'P01': (('B01',), ('CH01',), ('AU01',), ('SP01',)),
        'P02': (('B01',), ('CH01',), ('AU01',), ()),
        'P03': (('B02',), (), ('AU01',), ('SP02',)),
        'P04': (('B02',), (), ('AU01',), ()),
        'P05': (('B03',), (), ('AU01',), ()),
    }
    for pn in p['storyboard']['panels']:
        pn['beat_ids'], pn['visible_character_ids'], pn['audio_cue_ids'], pn['speech_ids'] = (
            list(values) for values in panel_links[pn['id']])
    return p


class StoryboardContractTests(unittest.TestCase):
    def test_valid_complete_board(self):
        self.assertEqual(validate_storyboard(board()), [])
    def test_panel_links_are_shot_scoped_and_known(self):
        cases = [
            ('beat outside shot', lambda p: p['storyboard']['panels'][0].update(beat_ids=['B02'])),
            ('unknown beat', lambda p: p['storyboard']['panels'][0].update(beat_ids=['B99'])),
            ('character outside shot', lambda p: p['storyboard']['panels'][2].update(visible_character_ids=['CH01'])),
            ('unknown audio cue', lambda p: p['storyboard']['panels'][0].update(audio_cue_ids=['AU99'])),
            ('audio cue outside shot', lambda p: (
                p['audio_cues'].append({'id': 'AU02', 'start_s': 0, 'end_s': 1, 'layer': 'sfx'}),
                p['storyboard']['panels'][2].update(audio_cue_ids=['AU02']))),
            ('unknown speech', lambda p: p['storyboard']['panels'][0].update(speech_ids=['SP99'])),
            ('speech outside shot', lambda p: p['storyboard']['panels'][2].update(speech_ids=['SP01'])),
            ('duplicate link', lambda p: p['storyboard']['panels'][0].update(beat_ids=['B01', 'B01'])),
            ('missing link field', lambda p: p['storyboard']['panels'][0].pop('audio_cue_ids')),
        ]
        for name, change in cases:
            with self.subTest(name=name):
                p = board(); change(p)
                self.assertTrue(validate_storyboard(p), name)

    def test_panels_cover_shot_beats_audio_and_speech(self):
        for field, value, fragment in (
            ('beat_ids', [], 'B01'),
            ('audio_cue_ids', [], 'AU01'),
            ('speech_ids', [], 'SP01'),
        ):
            with self.subTest(field=field):
                p = board()
                for pn in p['storyboard']['panels']:
                    if pn['shot_id'] == 'SH01':
                        pn[field] = value
                self.assertTrue(any(fragment in error for error in validate_storyboard(p)))

    def test_panel_audio_and_speech_links_overlap_panel_time(self):
        p = board()
        p['audio_cues'].append({'id': 'AU02', 'start_s': 3, 'end_s': 4, 'layer': 'sfx'})
        p['shots'][1]['audio_cue_ids'].append('AU02')
        p['storyboard']['panels'][4]['audio_cue_ids'].append('AU02')
        p['storyboard']['panels'][2]['audio_cue_ids'].append('AU02')
        p['storyboard']['panels'][3]['speech_ids'].append('SP02')
        errors = validate_storyboard(p)
        self.assertTrue(any('AU02' in e and 'panel time' in e for e in errors), errors)
        self.assertTrue(any('SP02' in e and 'panel time' in e for e in errors), errors)

    def test_semantic_artifact_roles_reject_unrelated_existing_ids(self):
        cases = [
            ('synopsis_artifact_id', lambda p: p['storyboard'].update(synopsis_artifact_id='VO01')),
            ('voice_artifact_id', lambda p: p['shots'][0]['speech'][0].update(voice_artifact_id='SYN')),
            ('spatial artifact', lambda p: p['shots'][0].update(spatial={'mode':'numeric','artifact_id':'A01'})),
        ]
        for fragment, change in cases:
            with self.subTest(reference=fragment):
                p=board();change(p)
                self.assertTrue(any(fragment in e for e in validate_storyboard(p)))
    def test_plan_profile_still_accepts_missing_storyboard(self):
        # Baseline gap Task 3 closes: plan validation sees no story obligation.
        p = board(); del p['storyboard']
        self.assertEqual(validate(p, 'plan'), [])
        self.assertTrue(validate_storyboard(p))

    def test_known_storyboard_rejections(self):
        cases = [
            ('storyboard not object', lambda p: p.update(storyboard=42)),
            ('bad synopsis ref', lambda p: p['storyboard'].update(synopsis_artifact_id='ZZ')),
            ('empty synopsis ref', lambda p: p['storyboard'].update(synopsis_artifact_id=' ')),
            ('missing beat', lambda p: p['storyboard']['beats'].pop(1)),
            ('duplicate beat', lambda p: p['storyboard']['beats'].append(dict(p['storyboard']['beats'][0]))),
            ('malformed beat', lambda p: p['storyboard']['beats'].append('x')),
            ('beat missing event', lambda p: p['storyboard']['beats'][0].pop('event')),
            ('reversed beats in one shot', lambda p: p['shots'][1].update(beat_ids=['B03', 'B02'])),
            ('reversed beats across shots', lambda p: (p['shots'][0].update(beat_ids=['B02', 'B03']),
                                                       p['shots'][1].update(beat_ids=['B01']))),
            ('empty beat_ids', lambda p: p['shots'][1].update(beat_ids=[])),
            ('unknown beat', lambda p: p['shots'][0].update(beat_ids=['B09'])),
            ('orphan scene', lambda p: p['scenes'].append({'id': 'S02', 'purpose': 'unused test scene'})),
            ('shot without panels', lambda p: p['storyboard'].update(
                panels=[x for x in p['storyboard']['panels'] if x['shot_id'] != 'SH02'])),
            ('missing end panel', lambda p: p['storyboard']['panels'].pop(4)),
            ('missing start panel', lambda p: p['storyboard']['panels'].pop(0)),
            ('end panel off last frame', lambda p: p['storyboard']['panels'][4].update(frame_time_s=93 / 24)),
            ('start panel off first frame', lambda p: p['storyboard']['panels'][0].update(frame_time_s=1 / 24)),
            ('panels out of order', lambda p: p['storyboard']['panels'].insert(0, p['storyboard']['panels'].pop(2))),
            ('bad role', lambda p: p['storyboard']['panels'][1].update(role='hold')),
            ('blank panel text', lambda p: p['storyboard']['panels'][1].update(reveals=' ')),
            ('unaligned frame', lambda p: p['storyboard']['panels'][3].update(frame_time_s=2.7)),
            ('frame outside shot', lambda p: p['storyboard']['panels'][3].update(frame_time_s=4)),
            ('unknown image asset', lambda p: p['storyboard']['panels'][0].update(image_asset_id='IM99')),
            ('unknown shot ref', lambda p: p['storyboard']['panels'][0].update(shot_id='SH99')),
            ('duplicate panel id', lambda p: p['storyboard']['panels'].append(copy.deepcopy(p['storyboard']['panels'][0]))),
            ('unknown sheet', lambda p: p['storyboard']['panels'][0].update(source_sheet_asset_id='SH99')),
            ('reversed crop', lambda p: p['storyboard']['panels'][0].update(crop_box=[10, 0, 5, 5])),
            ('nonint crop', lambda p: p['storyboard']['panels'][0].update(crop_box=[0, 0, 10.5, 10])),
            ('overlapping crops', lambda p: (
                p['storyboard']['panels'][0].update(source_sheet_asset_id='IM05', crop_box=[0, 0, 10, 10]),
                p['storyboard']['panels'][1].update(source_sheet_asset_id='IM05', crop_box=[5, 0, 15, 10]))),
            ('speech bad kind', lambda p: p['shots'][0]['speech'][0].update(kind='monologue')),
            ('dialogue null character', lambda p: p['shots'][0]['speech'][0].update(character_id=None)),
            ('dialogue wrong character', lambda p: p['shots'][0]['speech'][0].update(character_id='CH02')),
            ('narration lip sync', lambda p: p['shots'][1]['speech'][0].update(lip_sync='required')),
            ('narration bad character', lambda p: p['shots'][1]['speech'][0].update(character_id='CH99')),
            ('speech outside shot', lambda p: p['shots'][0]['speech'][0].update(end_s=3)),
            ('speech bad interval', lambda p: p['shots'][0]['speech'][0].update(start_s=1, end_s=1)),
            ('bad voice artifact', lambda p: p['shots'][0]['speech'][0].update(voice_artifact_id='VO99')),
            ('blank speech text', lambda p: p['shots'][0]['speech'][0].update(text='')),
            ('malformed speech', lambda p: p['shots'][0].update(speech=['x'])),
            ('speech not array', lambda p: p['shots'][0].update(speech={})),
            ('missing camera', lambda p: p['shots'][0].pop('camera')),
            ('empty camera field', lambda p: p['shots'][0]['camera'].update(movement='')),
            ('spatial bad mode', lambda p: p['shots'][0].update(spatial={'mode': 'guessed'})),
            ('spatial numeric no artifact', lambda p: p['shots'][0].update(spatial={'mode': 'numeric'})),
            ('spatial numeric bad ref', lambda p: p['shots'][0].update(spatial={'mode': 'numeric', 'artifact_id': 'ZZ'})),
            ('spatial na no reason', lambda p: p['shots'][0].update(spatial={'mode': 'not_applicable'})),
            ('vfx not bool', lambda p: p['shots'][0].update(vfx={'enabled': 'yes', 'description': 'x'})),
            ('vfx blank description', lambda p: p['shots'][0].update(vfx={'enabled': False, 'description': ''})),
            ('unknown audio cue', lambda p: p['shots'][0].update(audio_cue_ids=['AU99'])),
            ('audio cues not array', lambda p: p['shots'][0].update(audio_cue_ids='AU01')),
            ('unlinked overlapping cue', lambda p: p['shots'][0].update(audio_cue_ids=[])),
            ('linked nonoverlapping cue', lambda p: (
                p['audio_cues'].append({'id': 'AU02', 'start_s': 3, 'end_s': 4, 'layer': 'sfx'}),
                p['shots'][1].update(audio_cue_ids=['AU01', 'AU02']),
                p['shots'][0].update(audio_cue_ids=['AU01', 'AU02']))),
            ('panels not array', lambda p: p['storyboard'].update(panels={})),
            ('malformed panel', lambda p: p['storyboard']['panels'].append(None)),
        ]
        for name, change in cases:
            with self.subTest(name=name):
                p = board(); change(p); self.assertTrue(validate_storyboard(p), name)

    def test_invalid_fps_is_rejected_without_temporal_crashes(self):
        for fps in (0, -24, float('nan'), float('inf'), 1e308):
            with self.subTest(fps=fps):
                p = board()
                p['fps'] = fps
                self.assertTrue(validate_storyboard(p))

    def test_available_images_require_base_directory(self):
        p = board()
        for asset in p['asset_registry']:
            asset.update(status='available', path='image.png')
        errors = validate_storyboard(p, require_images=True)
        self.assertTrue(any('--base-dir' in error for error in errors))

    def test_same_beat_in_multiple_shots_allowed(self):
        # The contract allows one beat across shots; only first appearances order.
        p = board()
        p['shots'][1]['beat_ids'] = ['B02', 'B03', 'B01']
        p['storyboard']['panels'][2]['beat_ids'].append('B01')
        self.assertEqual(validate_storyboard(p), [])

    def test_static_shot_single_hold_panel(self):
        p = board()
        p['storyboard']['panels'] = [x for x in p['storyboard']['panels']
                                     if x['shot_id'] == 'SH01']
        hold = panel('P03', 'SH02', 2, 'hold', 'IM03',
                     beats=('B02', 'B03'), cues=('AU01',), speech=('SP02',))
        p['storyboard']['panels'].append(hold)
        # hold is only legal when start_state == end_state.
        p['shots'][1].update(start_state='held state', end_state='held state')
        self.assertEqual(validate_storyboard(p), [])
        # Same layout on a state-changing shot is rejected.
        q = copy.deepcopy(p); q['shots'][1]['end_state'] = 'changed state'
        self.assertTrue(validate_storyboard(q))
        # A second panel or a mixed hold is not a static-shot contract.
        q = copy.deepcopy(p)
        q['storyboard']['panels'].append(panel('P04', 'SH02', 2, 'hold', 'IM04'))
        self.assertTrue(validate_storyboard(q))
        q = copy.deepcopy(p)
        q['storyboard']['panels'].append(panel('P04', 'SH02', 95 / 24, 'end', 'IM04'))
        self.assertTrue(validate_storyboard(q))
        q = copy.deepcopy(p)
        q['storyboard']['panels'][-1]['frame_time_s'] = 3
        self.assertTrue(validate_storyboard(q))

    def test_silence_modes_forbid_speech(self):
        p = board(); p['audio_mode'] = 'no_audio'; p['audio_cues'] = []
        for s in p['shots']: s['audio_cue_ids'] = []
        for pn in p['storyboard']['panels']: pn['audio_cue_ids'] = []
        self.assertTrue(validate_storyboard(p))
        for s in p['shots']: s['speech'] = []
        for pn in p['storyboard']['panels']: pn['speech_ids'] = []
        self.assertEqual(validate_storyboard(p), [])
        q = board(); q['audio_mode'] = 'no_dialogue'
        self.assertTrue(validate_storyboard(q))
        for s in q['shots']: s['speech'] = []
        for pn in q['storyboard']['panels']: pn['speech_ids'] = []
        self.assertEqual(validate_storyboard(q), [])

    def test_require_images_checks_registered_files(self):
        p = board()
        self.assertTrue(any('base' in e for e in validate_storyboard(p, require_images=True)))
        with tempfile.TemporaryDirectory() as temp:
            # Planned images cannot satisfy the real-image gate.
            self.assertTrue(validate_storyboard(p, temp, require_images=True))
            for i, a in enumerate(p['asset_registry'], 1):
                Path(temp, f'cut{i}.png').write_bytes(b'fixture, not media')
                a.update(status='available', path=f'cut{i}.png')
            self.assertEqual(validate_storyboard(p, temp, require_images=True), [])
            Path(temp, 'cut1.png').unlink()
            self.assertTrue(validate_storyboard(p, temp, require_images=True))
            Path(temp, 'cut1.png').write_bytes(b'fixture, not media')
            p['asset_registry'][0]['path'] = '../outside.png'
            self.assertTrue(validate_storyboard(p, temp, require_images=True))

    def test_panel_crop_and_sheet_source_accepted(self):
        p = board()
        p['storyboard']['panels'][0].update(source_sheet_asset_id='IM01', crop_box=[0, 0, 10, 10])
        self.assertEqual(validate_storyboard(p), [])

    def test_registered_camera_file_reconciles_version_scene_and_timing(self):
        p=board()
        p['characters'].append({'id':'CH02','locked_traits':'fixture identity'})
        p['shots'][0]['character_ids'].append('CH02')
        p['shots'][0]['spatial']={'mode':'numeric','artifact_id':'CAM01'}
        spec_path=Path(__file__).resolve().parents[2]/'camera-spatial-design/assets/camera-spec-example.json'
        spec=json.loads(spec_path.read_text(encoding='utf-8'))
        spec.update(project_id=p['project_id'],shots=[spec['shots'][0]])
        p['artifacts'].append({'id':'CAM01','type':'camera_spec','version':spec['version'],
                               'status':'draft','dependencies':[],'dependency_versions':{},'asset_ids':['CAMFILE']})
        p['asset_registry'].append({'id':'CAMFILE','kind':'camera_spec','version':'1',
                                    'status':'available','path':'camera.json'})
        with tempfile.TemporaryDirectory() as temp:
            camera=Path(temp,'camera.json')
            camera.write_text(json.dumps(spec),encoding='utf-8')
            self.assertEqual(validate_storyboard(p,temp),[])
            for field,value,fragment in [('version','wrong','spec version'),('fps',30,'fps mismatch'),
                                          ('project_id','other','project_id mismatch')]:
                with self.subTest(field=field):
                    bad=copy.deepcopy(spec);bad[field]=value
                    camera.write_text(json.dumps(bad),encoding='utf-8')
                    self.assertTrue(any(fragment in e for e in validate_storyboard(p,temp)))
            bad=copy.deepcopy(spec);bad['shots'][0].pop('scene_id')
            camera.write_text(json.dumps(bad),encoding='utf-8')
            self.assertTrue(any('scene_id mismatch' in e for e in validate_storyboard(p,temp)))

    def test_malformed_inputs_return_errors_not_exceptions(self):
        bad = [None, 5, 'x', [], {'storyboard': 42},
               {'storyboard': {'beats': 'x', 'panels': 7, 'synopsis_artifact_id': []}},
               dict(board(), shots=[42, 'x']),
               dict(board(), storyboard={'synopsis_artifact_id': 'SYN', 'beats': [], 'panels': [None, {'id': 'P'}]}),
               dict(board(), scenes='x'),
               dict(board(), storyboard={'beats': [{'id': ['B']}], 'panels': [], 'synopsis_artifact_id': 'SYN'})]
        malformed_refs = board()
        malformed_refs['shots'][0]['beat_ids'] = [{}]
        bad.append(malformed_refs)
        for i, p in enumerate(bad):
            with self.subTest(case=i):
                self.assertTrue(validate_storyboard(p))

    def test_invalid_selected_storyboard_id_returns_structured_diagnostic(self):
        p = board()
        p['preproduction'] = {'storyboard_artifact_id': ['BOARD']}
        errors = validate_storyboard(p)
        self.assertTrue(any('storyboard_artifact_id: nonempty string required' in e
                            for e in errors))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, 'project.json')
            path.write_text(json.dumps(p), encoding='utf-8')
            result = subprocess.run([sys.executable, str(Path(__file__).with_name(
                'validate_storyboard.py')), str(path)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('storyboard_artifact_id', result.stdout)
            self.assertNotIn('Traceback', result.stderr)

    def test_cli_valid_board_and_missing_beat_rejection(self):

        with tempfile.TemporaryDirectory() as temp:
            p = board()
            path = Path(temp, 'project.json')
            path.write_text(json.dumps(p, ensure_ascii=False), encoding='utf-8')
            env = dict(os.environ, PYTHONUTF8='0', PYTHONCOERCECLOCALE='0', LC_ALL='C')
            script = Path(__file__).with_name('validate_storyboard.py')
            r = subprocess.run([sys.executable, str(script), str(path)], env=env,
                               capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertTrue(json.loads(r.stdout)['valid'])
            p['storyboard']['beats'].pop()
            path.write_text(json.dumps(p), encoding='utf-8')
            r = subprocess.run([sys.executable, str(script), str(path)], env=env,
                               capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(r.returncode, 1)
            self.assertFalse(json.loads(r.stdout)['valid'])


if __name__ == '__main__': unittest.main()
