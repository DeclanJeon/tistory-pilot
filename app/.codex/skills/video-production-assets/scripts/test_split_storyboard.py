"""Extraction regressions; synthetic pixels prove order/IDs only, not story quality."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from split_storyboard import split_storyboard


def sheet(path, w, h, colors, boxes):
    """Paint a sheet with flat color regions for the given crop boxes."""
    im = Image.new('RGB', (w, h), (0, 0, 0))
    for color, (l, t, r, b) in zip(colors, boxes):
        for x in range(l, r):
            for y in range(t, b):
                im.putpixel((x, y), color)
    im.save(path)


def project(**kw):
    p = {'schema_version': '1.1', 'project_id': 'test',
         'scenes': [{'id': 'S01', 'purpose': 'x'}],
         'characters': [{'id': 'CH01', 'locked_traits': 't'}],
         'audio_cues': [{'id': 'AU01', 'start_s': 0, 'end_s': 2, 'layer': 'music'}],
         'shots': [{'id': 'SH01', 'scene_id': 'S01', 'character_ids': ['CH01'],
                    'beat_ids': ['B01'], 'audio_cue_ids': ['AU01']},
                   {'id': 'SH02', 'scene_id': 'S01', 'character_ids': [],
                    'beat_ids': ['B02'], 'audio_cue_ids': []}],
         'asset_registry': [],
         'storyboard': {
             'synopsis_artifact_id': 'A01',
             'beats': [{'id': 'B01'}, {'id': 'B02'}],
             'panels': [
                 {'id': 'P01', 'shot_id': 'SH01', 'source_sheet_asset_id': 'SHEET1',
                  'crop_box': [0, 0, 2, 2], 'image_asset_id': 'CLEAN1'},
                 {'id': 'P02', 'shot_id': 'SH02', 'image_asset_id': 'CLEAN1'}]}}
    p.update(kw)
    return p


class SplitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        (self.base / 'sheet1.png').parent.mkdir(parents=True, exist_ok=True)
        sheet(self.base / 'sheet1.png', 4, 2, [(255, 0, 0), (0, 255, 0)],
              [[0, 0, 2, 2], [2, 0, 4, 2]])
        sheet(self.base / 'clean1.png', 3, 3, [(0, 0, 255)], [[0, 0, 3, 3]])

    def tearDown(self):
        self.temp.cleanup()

    def ready_project(self):
        p = project()
        p['asset_registry'] = [
            {'id': 'SHEET1', 'kind': 'storyboard-sheet', 'version': '1',
             'status': 'verified', 'path': 'sheet1.png'},
            {'id': 'CLEAN1', 'kind': 'panel', 'version': '1',
             'status': 'available', 'path': 'clean1.png'}]
        return p

    def out(self, name='cuts'):
        return self.base / name

    def test_pixels_order_and_manifest(self):
        manifest = split_storyboard(self.ready_project(), self.base, self.out())
        files = sorted(f.name for f in self.out().iterdir())
        self.assertEqual(files, ['0001_P01.png', '0002_P02.png', 'split-manifest.json'])
        self.assertEqual(Image.open(self.out() / '0001_P01.png').getpixel((0, 0)), (255, 0, 0))
        self.assertEqual(Image.open(self.out() / '0002_P02.png').getpixel((0, 0)), (0, 0, 255))
        first, second = manifest['entries']
        self.assertEqual(first['sha256'],
                         hashlib.sha256((self.out() / '0001_P01.png').read_bytes()).hexdigest())
        self.assertEqual(first['shot_id'], 'SH01')
        self.assertEqual(first['beat_ids'], ['B01'])
        self.assertEqual(first['character_ids'], ['CH01'])
        self.assertEqual(first['audio_cue_ids'], ['AU01'])
        self.assertEqual(first['source_asset_id'], 'SHEET1')
        self.assertEqual(first['crop_box'], [0, 0, 2, 2])
        self.assertEqual(second['source_asset_id'], 'CLEAN1')
        self.assertEqual(second['sha256'],
                         hashlib.sha256((self.out() / '0002_P02.png').read_bytes()).hexdigest())
        # Clean cut pixels are preserved through PNG reencode.
        with Image.open(self.out() / '0002_P02.png') as out_im, \
                Image.open(self.base / 'clean1.png') as source_im:
            self.assertEqual((out_im.mode, out_im.size, out_im.tobytes()),
                             (source_im.mode, source_im.size, source_im.tobytes()))
        on_disk = json.loads((self.out() / 'split-manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(on_disk, manifest)

    def test_second_crop_from_same_sheet(self):
        p = self.ready_project()
        p['storyboard']['panels'] = [
            {'id': 'P01', 'shot_id': 'SH01', 'source_sheet_asset_id': 'SHEET1',
             'crop_box': [0, 0, 2, 2]},
            {'id': 'P02', 'shot_id': 'SH01', 'source_sheet_asset_id': 'SHEET1',
             'crop_box': [2, 0, 4, 2]}]
        split_storyboard(p, self.base, self.out())
        self.assertEqual(Image.open(self.out() / '0002_P02.png').getpixel((0, 0)), (0, 255, 0))

    def test_preflight_rejects_and_writes_nothing(self):
        cases = [
            ('overlap', lambda p: p['storyboard']['panels'].append(
                {'id': 'P03', 'shot_id': 'SH01', 'source_sheet_asset_id': 'SHEET1',
                 'crop_box': [1, 0, 3, 2]})),
            ('out of bounds', lambda p: p['storyboard']['panels'][0].update(crop_box=[0, 0, 9, 2])),
            ('inverted', lambda p: p['storyboard']['panels'][0].update(crop_box=[2, 0, 0, 2])),
            ('empty', lambda p: p['storyboard']['panels'][0].update(crop_box=[0, 0, 0, 2])),
            ('float crop', lambda p: p['storyboard']['panels'][0].update(crop_box=[0, 0, 1.5, 2])),
            ('bool crop', lambda p: p['storyboard']['panels'][0].update(crop_box=[0, 0, True, 2])),
            ('box without sheet', lambda p: p['storyboard']['panels'][0].pop('source_sheet_asset_id')),
            ('unknown sheet', lambda p: p['storyboard']['panels'][0].update(source_sheet_asset_id='NOPE')),
            ('planned sheet', lambda p: p['asset_registry'][0].update(status='planned')),
            ('missing file', lambda p: p['asset_registry'][1].update(path='gone.png')),
            ('unknown image', lambda p: p['storyboard']['panels'][1].update(image_asset_id='NOPE')),
            ('unsafe id', lambda p: p['storyboard']['panels'][0].update(id='../evil')),
            ('unknown shot', lambda p: p['storyboard']['panels'][0].update(shot_id='SH99')),
            ('unknown beat', lambda p: p['shots'][0].update(beat_ids=['B99'])),
            ('escape path', lambda p: p['asset_registry'][1].update(path='../out.png')),
            ('absolute path', lambda p: p['asset_registry'][1].update(path=str(self.base / 'clean1.png'))),
            ('not object', lambda p: p['storyboard'].update(panels='x')),
            ('duplicate id', lambda p: p['storyboard']['panels'].append(
                dict(p['storyboard']['panels'][0]))),
        ]
        for n, (name, change) in enumerate(cases):
            with self.subTest(name=name):
                p = self.ready_project()
                change(p)
                with self.assertRaises(ValueError, msg=name):
                    split_storyboard(p, self.base, self.out(f'cuts{n}'))
                self.assertFalse(self.out(f'cuts{n}').exists(), name)

    def test_existing_output_refused(self):
        self.out().mkdir()
        with self.assertRaises(ValueError):
            split_storyboard(self.ready_project(), self.base, self.out())
        self.assertEqual(list(self.out().iterdir()), [])

    def test_collects_errors_before_output(self):

        p = self.ready_project()
        p['storyboard']['panels'][0].update(crop_box=[0, 0, 9, 2])
        p['storyboard']['panels'][1].update(image_asset_id='NOPE')
        with self.assertRaises(ValueError) as cm:
            split_storyboard(p, self.base, self.out())
        self.assertIn('outside image', str(cm.exception))
        self.assertIn('unknown image_asset_id', str(cm.exception))
        self.assertFalse(self.out().exists())

    def test_repeated_run_refuses(self):
        p = self.ready_project()
        split_storyboard(p, self.base, self.out())
        with self.assertRaises(ValueError):
            split_storyboard(p, self.base, self.out())
        files = sorted(f.name for f in self.out().iterdir())
        self.assertEqual(files, ['0001_P01.png', '0002_P02.png', 'split-manifest.json'])

    def test_project_not_mutated(self):
        p = self.ready_project()
        frozen = json.loads(json.dumps(p))
        split_storyboard(p, self.base, self.out())
        self.assertEqual(p, frozen)

    def test_clean_jpeg_reencoded_to_real_png(self):
        Image.new('RGB', (3, 3), (0, 0, 255)).save(self.base / 'clean.jpg')
        with Image.open(self.base / 'clean.jpg') as src:
            source_pixels = (src.mode, src.size, src.tobytes())
        p = self.ready_project()
        p['asset_registry'][1].update(path='clean.jpg')
        manifest = split_storyboard(p, self.base, self.out())
        out = self.out() / '0002_P02.png'
        with Image.open(out) as im:
            self.assertEqual(im.format, 'PNG')
            self.assertEqual((im.mode, im.size, im.tobytes()), source_pixels)
        self.assertEqual(manifest['entries'][1]['sha256'],
                         hashlib.sha256(out.read_bytes()).hexdigest())

    def test_duplicate_panel_id_rejected_case_insensitive(self):
        p = self.ready_project()
        p['storyboard']['panels'][1].update(id='p01')
        with self.assertRaises(ValueError) as cm:
            split_storyboard(p, self.base, self.out())
        self.assertIn('duplicate', str(cm.exception))
        self.assertFalse(self.out().exists())

    def test_empty_panels_rejected(self):
        p = self.ready_project()
        p['storyboard']['panels'] = []
        with self.assertRaises(ValueError):
            split_storyboard(p, self.base, self.out())

    def test_truncated_image_body_rejected(self):
        data = (self.base / 'clean1.png').read_bytes()
        (self.base / 'broken.png').write_bytes(data[:len(data) // 2])
        p = self.ready_project()
        p['asset_registry'][1].update(path='broken.png')
        with self.assertRaises(ValueError):
            split_storyboard(p, self.base, self.out())
        self.assertFalse(self.out().exists())

    def test_malformed_ids_and_tables_no_crash(self):
        p = self.ready_project()
        p['storyboard']['panels'][0].update(id=['P01'], shot_id=['SH01'])
        p['asset_registry'].append({'id': ['BAD'], 'status': 'available', 'path': 'x.png'})
        p['shots'][0].update(beat_ids=[['B01']], audio_cue_ids='not-a-list',
                             character_ids=[{'id': 'CH01'}])
        p['storyboard']['beats'].append({'id': ['X']})
        with self.assertRaises(ValueError) as cm:
            split_storyboard(p, self.base, self.out())
        self.assertIn('unsafe panel id', str(cm.exception))
        self.assertFalse(self.out().exists())



def produced_sheet(path, size, pixels, panel_ids, bounds, bands,
                   traceability=None, index=1, count=1):
    """Write a PNG that mimics a produced storyboard sheet: flat pixel
    regions at recorded bounds plus the renderer's text metadata."""
    from PIL import PngImagePlugin
    im = Image.new('RGB', size, (0, 0, 0))
    for color, box in pixels:
        for x in range(box[0], box[2]):
            for y in range(box[1], box[3]):
                im.putpixel((x, y), color)
    meta = PngImagePlugin.PngInfo()
    meta.add_text('storyboard_sheet.panel_ids', ','.join(panel_ids))
    meta.add_text('storyboard_sheet.panel_bounds',
                  json.dumps([{'panel_id': p, 'bounds': b}
                              for p, b in zip(panel_ids, bounds)]))
    meta.add_text('storyboard_sheet.scene_bounds', json.dumps(bands))
    meta.add_text('storyboard_sheet.panel_traceability',
                  json.dumps(traceability or [{'panel_id': p} for p in panel_ids]))
    meta.add_text('storyboard_sheet.source_sha256', '{}')
    meta.add_text('storyboard_sheet.sheet_index', str(index))
    meta.add_text('storyboard_sheet.sheet_count', str(count))
    im.save(path, pnginfo=meta)


class SheetModeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def proj(self):
        p = project()
        p['scenes'].append({'id': 'S02', 'purpose': 'y'})
        p['shots'][1]['scene_id'] = 'S02'
        return p

    def out(self, name='cuts'):
        return self.base / name

    def test_extracts_clean_panels_scene_dirs_and_overviews(self):
        p = self.proj()
        produced_sheet(self.base / 's1.png', (20, 10),
                       [((255, 0, 0), [2, 2, 6, 6])],
                       ['P01'], [[2, 2, 6, 6]],
                       [{'scene_id': 'S01', 'bounds': [1, 1, 19, 9]}])
        produced_sheet(self.base / 's2.png', (20, 10),
                       [((0, 255, 0), [3, 1, 7, 5])],
                       ['P02'], [[3, 1, 7, 5]],
                       [{'scene_id': 'S02', 'bounds': [1, 0, 19, 8]}],
                       index=2, count=2)
        manifest = split_storyboard(p, self.base, self.out(),
                                    sheets=['s1.png', 's2.png'])
        # Clean panel images are real recorded-bounds crops.
        p1 = Image.open(self.out() / 'scenes/S01/panels/0001_P01.png')
        self.assertEqual(p1.size, (4, 4))
        self.assertEqual(p1.getpixel((0, 0)), (255, 0, 0))
        p2 = Image.open(self.out() / 'scenes/S02/panels/0002_P02.png')
        self.assertEqual(p2.getpixel((0, 0)), (0, 255, 0))
        # Scene overview exists per scene and carries only its own band.
        o1 = Image.open(self.out() / 'scenes/S01/S01.png')
        self.assertEqual(o1.size, (18, 8))
        colors = {c for _, c in o1.getcolors(o1.width * o1.height)}
        self.assertIn((255, 0, 0), colors)
        self.assertNotIn((0, 255, 0), colors)
        # Manifest: exact paths, indices, checksums, sheet provenance.
        e1, e2 = manifest['entries']
        self.assertEqual(e1['file'], 'scenes/S01/panels/0001_P01.png')
        self.assertEqual((e1['panel_id'], e1['shot_id'], e1['scene_id']),
                         ('P01', 'SH01', 'S01'))
        self.assertEqual(e1['bounds'], [2, 2, 6, 6])
        self.assertEqual(e2['scene_id'], 'S02')
        self.assertEqual(e2['sheet_path'], 's2.png')
        self.assertEqual(e2['sheet_index'], 2)
        self.assertEqual(e1['sha256'],
                         hashlib.sha256((self.out() / e1['file']).read_bytes()).hexdigest())
        scenes = {s['scene_id']: s for s in manifest['scenes']}
        self.assertEqual(set(scenes), {'S01', 'S02'})
        self.assertEqual(scenes['S02']['panel_ids'], ['P02'])
        self.assertEqual([s['sheet_index'] for s in manifest['sheets']], [1, 2])
        on_disk = json.loads((self.out() / 'split-manifest.json').read_text())
        self.assertEqual(on_disk, manifest)

    def test_missing_recorded_bounds_rejected_no_output(self):
        Image.new('RGB', (20, 10), (0, 0, 0)).save(self.base / 'plain.png')
        Image.new('RGB', (20, 10), (0, 0, 0)).save(self.base / 'plain2.png')
        with self.assertRaises(ValueError):
            split_storyboard(self.proj(), self.base, self.out(),
                             sheets=['plain.png', 'plain2.png'])
        self.assertFalse(self.out().exists())

    def test_coverage_mismatch_rejected_no_output(self):
        produced_sheet(self.base / 'only.png', (20, 10),
                       [((255, 0, 0), [2, 2, 6, 6])],
                       ['P01'], [[2, 2, 6, 6]],
                       [{'scene_id': 'S01', 'bounds': [1, 1, 19, 9]}])
        with self.assertRaisesRegex(ValueError, 'coverage'):
            split_storyboard(self.proj(), self.base, self.out(),
                             sheets=['only.png'])
        self.assertFalse(self.out().exists())

    def test_corrupt_second_sheet_leaves_no_partial_output(self):
        produced_sheet(self.base / 'good.png', (20, 10),
                       [((255, 0, 0), [2, 2, 6, 6])],
                       ['P01'], [[2, 2, 6, 6]],
                       [{'scene_id': 'S01', 'bounds': [1, 1, 19, 9]}])
        (self.base / 'bad.png').write_bytes(b'not an image')
        with self.assertRaises(ValueError):
            split_storyboard(self.proj(), self.base, self.out(),
                             sheets=['good.png', 'bad.png'])
        self.assertFalse(self.out().exists())
        self.assertEqual([f for f in self.base.iterdir()
                          if f.name.startswith('.cuts')], [])

    def test_existing_output_refused(self):
        self.out().mkdir()
        produced_sheet(self.base / 's1.png', (20, 10), [], ['P01'], [],
                       [{'scene_id': 'S01', 'bounds': [0, 0, 1, 1]}])
        with self.assertRaisesRegex(ValueError, 'already exists'):
            split_storyboard(self.proj(), self.base, self.out(), sheets=['s1.png'])

    def test_sheet_output_cannot_escape_project_root(self):
        outside = self.base.parent / (self.base.name + '-escaped')
        with self.assertRaisesRegex(ValueError, 'inside'):
            split_storyboard(self.proj(), self.base, outside, sheets=['s1.png'])
        self.assertFalse(outside.exists())

    def test_scene_id_cannot_escape_extraction_directory(self):
        p = self.proj()
        p['shots'][0]['scene_id'] = '../../escape'
        produced_sheet(self.base / 'sheet.png', (20, 10),
                       [((255, 0, 0), [2, 2, 6, 6]), ((0, 255, 0), [10, 2, 14, 6])],
                       ['P01', 'P02'], [[2, 2, 6, 6], [10, 2, 14, 6]],
                       [{'scene_id': '../../escape', 'bounds': [1, 1, 7, 9]},
                        {'scene_id': 'S02', 'bounds': [9, 1, 19, 9]}])
        with self.assertRaisesRegex(ValueError, 'unsafe scene_id'):
            split_storyboard(p, self.base, self.out(), sheets=['sheet.png'])
        self.assertFalse(self.out().exists())

    def test_source_version_drift_blocks_extraction(self):
        p = self.proj()
        p['asset_registry'].append({'id': 'SOURCE', 'version': '2', 'sha256': 'current'})
        produced_sheet(self.base / 'sheet.png', (20, 10),
                       [((255, 0, 0), [2, 2, 6, 6]), ((0, 255, 0), [10, 2, 14, 6])],
                       ['P01', 'P02'], [[2, 2, 6, 6], [10, 2, 14, 6]],
                       [{'scene_id': 'S01', 'bounds': [1, 1, 7, 9]},
                        {'scene_id': 'S02', 'bounds': [9, 1, 19, 9]}],
                       traceability=[{'panel_id': 'P01', 'source_asset_id': 'SOURCE',
                                      'source_asset_version': '1'},
                                     {'panel_id': 'P02'}])
        with self.assertRaisesRegex(ValueError, 'changed since'):
            split_storyboard(p, self.base, self.out(), sheets=['sheet.png'])
        self.assertFalse(self.out().exists())

if __name__ == '__main__':
    unittest.main()
