import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { produceSheets } from '../production.mjs';

const RED = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAANUlEQVR4nO3QsQ0AMAzDsLT//9yeoCkbeYAN6LzZdZf3x0GSKEmUJEoSJYmSREmiJFGSaMoHo8QBPwYSAhsAAAAASUVORK5CYII=';
const BLUE = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAN0lEQVR4nO3RMQ0AMAzEQLf8OacQ3CWbD8BHcg4Mm+7qOh340A9UiVSJVIlUiVSJVIlUiVSJMA+hxgE/8m7SpQAAAABJRU5ErkJggg==';

async function runFixture(root, { incomplete = false } = {}) {
  const projectDir = path.join(root, 'project');
  const helper = path.join(root, 'fixture-helper.mjs');
  await fs.writeFile(helper, `
    import fs from 'node:fs/promises';
    import path from 'node:path';
    const args = process.argv.slice(2);
    const output = args[args.indexOf('--output') + 1];
    await fs.mkdir(path.dirname(output), { recursive: true });
    let images;
    if (${incomplete}) {
      await fs.writeFile(output, Buffer.from('${BLUE}', 'base64'));
      images = [{ path: output, decodedPath: output, status: 'in_progress', partial: true }];
    } else {
      const first = output.replace(/\\.png$/, '-1.png');
      const last = output.replace(/\\.png$/, '-2.png');
      await fs.writeFile(first, Buffer.from('${RED}', 'base64'));
      await fs.writeFile(last, Buffer.from('${BLUE}', 'base64'));
      images = [
        { path: first, decodedPath: output, status: 'completed', partial: false },
        { path: last, decodedPath: last, status: 'completed', partial: false }
      ];
    }
    console.log(JSON.stringify({ images }));
  `);
  return produceSheets({
    projectDir,
    recipe: {
      characters: [{ id: 'cat', imagePrompt: 'Seven-view neutral reference of one original grey adult cat.', anchors: [] }],
      scenes: [{ id: 'scene-1', characterIds: ['cat'],
        startImagePrompt: 'Grey cat beside a closed door.', endImagePrompt: 'Grey cat beside an open door.',
        flowPrompt10s: 'The cat opens the door over ten seconds.', flowPrompt8s: 'The cat opens the door over eight seconds.' }]
    },
    env: { ...process.env, CODEX_IMAGEN_SCRIPT: helper },
    callJson: async () => { throw new Error('Reviewer intentionally unavailable; fixture images must never be approved'); }
  });
}

test('multi-output generation uses the last actual image, not a stale decodedPath alias', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'imagen-multi-output-'));
  try {
    const project = await runFixture(root);
    const expected = Buffer.from(BLUE, 'base64');
    const asset = project.assets.find(asset => asset.id === 'character-sheet-cat');
    assert.equal(project.state, 'needs_review');
    assert.equal(asset.sha256, crypto.createHash('sha256').update(expected).digest('hex'));
    assert.deepEqual(await fs.readFile(path.join(root, 'project', asset.path)), expected);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a saved partial image cannot be recorded as completed production', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'imagen-partial-output-'));
  try {
    await assert.rejects(runFixture(root, { incomplete: true }), /no completed file/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('long caption remains complete and its last line is inside the rendered caption band', () => {
  execFileSync(process.env.AI_VIDEO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', String.raw`
import importlib.util, sys, tempfile, os
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location("renderer", sys.argv[1])
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
with tempfile.TemporaryDirectory() as root:
    Image.new("RGB", (32, 18), "#cfe3f0").save(os.path.join(root, "source.png"))
    caption = " ".join(["long-caption"] * 20 + ["FINAL"])
    font, _ = renderer.load_font(24)
    measure = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    lines = renderer.wrap_caption(measure, caption, font, 160 - 2 * renderer.INNER_PAD)
    assert "".join(lines).replace(" ", "") == caption.replace(" ", ""), "caption text was discarded"
    sheet, cells, _ = renderer.render_sheet({"sheet": {"out": "sheet.png", "cols": 1,
        "cellWidth": 160, "cellHeight": 90, "captionHeight": 24,
        "panels": [{"id": "one", "image": "source.png", "caption": caption}]}}, root)
    x0, y0, x1, y1 = cells["one"]["captionRect"]
    ascent, descent = font.getmetrics()
    line_h = ascent + descent + 6
    assert y1 - y0 >= len(lines) * line_h + 2 * renderer.INNER_PAD, "caption band clips complete text"
    y = y0 + ((y1 - y0) - len(lines) * line_h) // 2 + (len(lines) - 1) * line_h
    width = renderer.text_width(measure, lines[-1], font)
    left = int(x0 + ((x1 - x0) - width) / 2)
    bounds = measure.textbbox((left, y), lines[-1], font=font, anchor="lt")
    assert bounds[3] <= y1 - renderer.INNER_PAD
    reference = Image.new("RGB", sheet.size, "#ffffff")
    ImageDraw.Draw(reference).text((x0 + ((x1 - x0) - width) / 2, y), lines[-1],
        font=font, fill="#111111", anchor="lt")
    assert sheet.crop(bounds).tobytes() == reference.crop(bounds).tobytes(), "final line is not visible"
`, path.join(import.meta.dirname, '..', 'render-sheets.py')], { timeout: 60000, stdio: 'pipe' });
});
