"""Actual image and safe-output behavior; synthetic pixels are not artistic QA."""
import copy
import hashlib
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from PIL import Image
from render_storyboard_sheet import (MAX_PANELS_PER_SHEET, render_sheet,
                                     render_sheets, resolve_font)
from test_validate_preproduction import image_package
from validate_project import validate


class StoryboardRenderTests(unittest.TestCase):
    def font(self):
        try:
            return resolve_font()[1]
        except ValueError as exc:
            self.skipTest(str(exc))

    def test_all_panel_pixels_present_and_output_cannot_overwrite(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            result = render_sheet(p, root, 'actual.png', font_path=self.font())
            with Image.open(Path(root) / 'actual.png') as im:
                colors = {color for count, color in im.convert('RGB').getcolors(im.width * im.height)}
                self.assertTrue(all((i * 40, 20, 80) in colors for i in range(5)))
            before = (Path(root) / 'actual.png').read_bytes()
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                render_sheet(p, root, 'actual.png')
            self.assertEqual((Path(root) / 'actual.png').read_bytes(), before)
            self.assertEqual(result['sha256'], hashlib.sha256(before).hexdigest())

    def test_rendered_captions_expose_panel_level_traceability(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            result = render_sheet(p, root, 'traceability.png', font_path=self.font())
            with Image.open(Path(root) / 'traceability.png') as rendered:
                metadata = rendered.info['storyboard_sheet.panel_traceability']
            self.assertEqual(json.loads(metadata), result['panel_traceability'])
            first = result['panel_traceability'][0]
            self.assertEqual(first['panel_id'], 'P01')
            self.assertEqual(first['beat_ids'], ['B01'])
            self.assertEqual(first['visible_character_ids'], ['CH01'])
            self.assertEqual(first['audio_cue_ids'], ['AU01'])
            self.assertIn('SP01', first['speech_ids'])
            self.assertTrue(any('reveals test reveal' in line for line in first['caption']))

    def test_corrupt_or_changed_input_writes_no_sheet(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            (Path(root) / 'panel0.png').write_bytes(b'corrupt actual image')
            with self.assertRaises(ValueError):
                render_sheet(p, root, 'missing.png')
            self.assertFalse((Path(root) / 'missing.png').exists())

    def test_output_confinement_before_any_write(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            with self.assertRaisesRegex(ValueError, 'escapes'):
                render_sheet(p, root, '../escape.png')

    def test_crop_source_hashes_register_as_actual_inputs(self):
        with tempfile.TemporaryDirectory() as root:
            p = image_package(root)
            canvas = Path(root) / 'input-sheet.png'
            Image.new('RGB', (40, 24), 'orange').save(canvas)
            digest = hashlib.sha256(canvas.read_bytes()).hexdigest()
            p['asset_registry'].append({'id':'CROPINPUT', 'kind':'image', 'version':'1',
                                       'path':canvas.name, 'status':'available', 'sha256':digest})
            p['storyboard']['panels'][0].update(source_sheet_asset_id='CROPINPUT',crop_box=[0,0,40,24])
            result = render_sheet(p, root, 'crop-output.png', font_path=self.font())
            sheet = next(a for a in p['asset_registry'] if a['id'] == 'SHEETIMG')
            sheet.update(path=result['relative_path'], sha256=result['sha256'],
                         panel_ids=result['panel_ids'], source_asset_ids=result['source_asset_ids'],
                         source_sha256=result['source_sha256'])
            self.assertEqual(validate(p,'preproduction',root), [])
            self.assertEqual(result['source_asset_ids'][0], 'CROPINPUT')
            self.assertEqual(result['source_sha256']['CROPINPUT'],digest)
            sheet['source_sha256']['CROPINPUT'] = '0' * 64
            self.assertTrue(any('source hashes' in e for e in validate(p,'preproduction',root)))




def _multi_scene_package(root):
    """Extend image_package to 10 canonical panels over 2 scenes (S02 is
    appended mid-timeline so scene order differs from shot order)."""
    p = image_package(root)
    p['target_duration_s'] = 6
    p['scenes'].append({'id': 'S02', 'purpose': 'test second scene'})
    p['audio_cues'][0]['end_s'] = 6  # BGM must overlap/link SH03
    sh = copy.deepcopy(p['shots'][0])
    sh.update(id='SH03', scene_id='S02', start_s=4, end_s=6,
              source_duration_s=2, character_ids=[],
              beat_ids=['B03'], audio_cue_ids=['AU01'], speech=[])
    p['shots'].append(sh)
    for i in range(6, 11):
        aid = f'IM{i:02d}'
        p['asset_registry'].append(
            {'id': aid, 'kind': 'image', 'version': '1',
             'status': 'available', 'path': f'panel{i}.png',
             'sha256': None})
        Image.new('RGB', (40, 24), (i * 20, 30, 90)).save(Path(root) / f'panel{i}.png')
        p['asset_registry'][-1]['sha256'] = hashlib.sha256(
            (Path(root) / f'panel{i}.png').read_bytes()).hexdigest()
    frames = [4, 4.5, 5, 5.5, 143 / 24]
    roles = ['start', 'action_peak', 'action_peak', 'action_peak', 'end']
    for i, (fr, role) in enumerate(zip(frames, roles), 6):
        pn = copy.deepcopy(p['storyboard']['panels'][0])
        pn.update(id=f'P{i:02d}', shot_id='SH03', frame_time_s=fr,
                  role=role, image_asset_id=f'IM{i:02d}',
                  beat_ids=['B03'], visible_character_ids=[],
                  audio_cue_ids=['AU01'], speech_ids=[])
        p['storyboard']['panels'].append(pn)
    return p


class MultiSheetTests(unittest.TestCase):
    def font(self):
        try:
            return resolve_font()[1]
        except ValueError as exc:
            self.skipTest(str(exc))

    def test_paginates_at_eight_panels_and_covers_all(self):
        with tempfile.TemporaryDirectory() as root:
            p = _multi_scene_package(root)
            result = render_sheets(p, root, 'board.png', font_path=self.font())
            sheets = result['sheets']
            self.assertEqual(len(sheets), 2)
            self.assertEqual([len(s['panel_ids']) for s in sheets], [8, 2])
            self.assertEqual(
                [pid for s in sheets for pid in s['panel_ids']],
                [x['id'] for x in p['storyboard']['panels']])
            self.assertEqual(sheets[0]['sheet_index'], 1)
            self.assertEqual(sheets[1]['sheet_index'], 2)
            self.assertEqual(sheets[0]['sheet_count'], 2)
            names = {s['relative_path'] for s in sheets}
            self.assertEqual(names, {'board_s01.png', 'board_s02.png'})
            for s in sheets:
                with Image.open(Path(root) / s['relative_path']) as im:
                    self.assertEqual(im.info['storyboard_sheet.sheet_index'],
                                     str(s['sheet_index']))
                    recorded = json.loads(im.info['storyboard_sheet.panel_bounds'])
                    self.assertEqual([b['panel_id'] for b in recorded],
                                     s['panel_ids'])
                    # Recorded bounds crop real pixels: each panel's color is
                    # recoverable at its exact recorded rect.
                    for b in recorded:
                        pn = next(x for x in p['storyboard']['panels']
                                  if x['id'] == b['panel_id'])
                        crop = im.convert('RGB').crop(b['bounds'])
                        source_path = next(a['path'] for a in p['asset_registry']
                                           if a['id'] == pn['image_asset_id'])
                        with Image.open(Path(root) / source_path) as source:
                            self.assertEqual(crop.getpixel((2, 2)), source.getpixel((2, 2)))

    def test_scene_bands_exclude_other_scenes(self):
        with tempfile.TemporaryDirectory() as root:
            p = _multi_scene_package(root)
            sheets = render_sheets(p, root, 'board.png',
                                   font_path=self.font())['sheets']
            s2 = sheets[1]
            self.assertEqual(s2['scene_ids'], ['S02'])
            with Image.open(Path(root) / s2['relative_path']) as im:
                bands = json.loads(im.info['storyboard_sheet.scene_bounds'])
                self.assertEqual([b['scene_id'] for b in bands], ['S02'])
                band = im.convert('RGB').crop(bands[0]['bounds'])
                colors = {c for _, c in band.getcolors(band.width * band.height)}
                assets = {asset['id']: asset for asset in p['asset_registry']}
                panels = {panel['id']: panel for panel in p['storyboard']['panels']}
                for pid in s2['panel_ids']:
                    with Image.open(Path(root) / assets[panels[pid]['image_asset_id']]['path']) as source:
                        self.assertIn(source.getpixel((0, 0)), colors)
                for panel in p['storyboard']['panels'][:5]:
                    with Image.open(Path(root) / assets[panel['image_asset_id']]['path']) as source:
                        self.assertNotIn(source.getpixel((0, 0)), colors)

    def test_single_render_refuses_pagination(self):
        with tempfile.TemporaryDirectory() as root:
            p = _multi_scene_package(root)
            with self.assertRaisesRegex(ValueError, 'sheets'):
                render_sheet(p, root, 'single.png', font_path=self.font())
            self.assertFalse((Path(root) / 'single.png').exists())
            self.assertFalse((Path(root) / 'single_s01.png').exists())

    def test_any_output_collision_writes_no_sheets(self):
        with tempfile.TemporaryDirectory() as root:
            p = _multi_scene_package(root)
            Path(root, 'board_s02.png').write_bytes(b'do not clobber')
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                render_sheets(p, root, 'board.png', font_path=self.font())
            self.assertFalse((Path(root) / 'board_s01.png').exists())
            self.assertEqual(Path(root, 'board_s02.png').read_bytes(),
                             b'do not clobber')

    def test_paginated_dangling_link_writes_nothing_outside(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            p = _multi_scene_package(root)
            link = Path(root) / 'board_s01.png'
            target = Path(outside) / 'external.png'
            try:
                link.symlink_to(target)
            except OSError as exc:
                self.skipTest(f"symlink unavailable: {exc}")
            with self.assertRaisesRegex(ValueError, 'already exists'):
                render_sheets(p, root, 'board.png', font_path=self.font())
            self.assertFalse(target.exists())
            self.assertFalse((Path(root) / 'board_s02.png').exists())

    def test_density_limit_preserves_panel_coverage(self):
        with tempfile.TemporaryDirectory() as root:
            p = _multi_scene_package(root)
            sheets = render_sheets(p, root, 'dense.png', font_path=self.font(),
                                   panels_per_sheet=3)['sheets']
            self.assertEqual([len(s['panel_ids']) for s in sheets], [3, 3, 3, 1])
            self.assertEqual([pid for s in sheets for pid in s['panel_ids']],
                             [panel['id'] for panel in p['storyboard']['panels']])
            for bad in (0, 9, True):
                with self.assertRaisesRegex(ValueError, '1 to 8'):
                    render_sheets(p, root, 'invalid.png', panels_per_sheet=bad)
            self.assertFalse(Path(root, 'invalid.png').exists())

    def test_failure_does_not_delete_a_racing_user_file(self):
        import render_storyboard_sheet as renderer
        with tempfile.TemporaryDirectory() as root:
            p = _multi_scene_package(root)
            original = renderer._render_one
            def render_or_collide(*args):
                if args[-3] == 2:
                    args[-1].write_bytes(b'user file created after preflight')
                    raise ValueError('output collision')
                return original(*args)
            with patch.object(renderer, '_render_one', side_effect=render_or_collide):
                with self.assertRaisesRegex(ValueError, 'collision'):
                    render_sheets(p, root, 'board.png', font_path=self.font())
            self.assertFalse(Path(root, 'board_s01.png').exists())
            self.assertEqual(Path(root, 'board_s02.png').read_bytes(),
                             b'user file created after preflight')


if __name__ == '__main__':
    unittest.main()
