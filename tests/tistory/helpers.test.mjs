import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryUrl,
  buildEditorUrl,
  collectBodyImageDataUrls,
  normalizeBlogUrl,
  writeDataUrlFile
} from '../../src/core/tistory/helpers.mjs';

test('tistory helpers normalize blog urls and category/editor endpoints', () => {
  assert.equal(normalizeBlogUrl('acstory.tistory.com'), 'https://acstory.tistory.com');
  assert.equal(buildEditorUrl('https://acstory.tistory.com/some/path'), 'https://acstory.tistory.com/manage/newpost');
  assert.equal(buildCategoryUrl('acstory.tistory.com'), 'https://acstory.tistory.com/manage/category');
});

test('tistory helpers persist data urls and collect local markdown images', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-tistory-helpers-'));
  const imagePath = path.join(tempRoot, 'image.png');
  await fs.writeFile(imagePath, Buffer.from('hello'));

  const collected = collectBodyImageDataUrls(`![alt](${imagePath})\n\n![remote](https://example.com/x.png)`);
  assert.match(collected[imagePath], /^data:image\/png;base64,/);

  const outputPath = path.join(tempRoot, 'nested', 'copy.png');
  const written = writeDataUrlFile(outputPath, collected[imagePath]);
  const writtenBytes = await fs.readFile(written);
  assert.equal(writtenBytes.toString(), 'hello');
});

test('tistory helpers ignore missing local html assets', () => {
  const collected = collectBodyImageDataUrls('<img src="assets/missing.png" alt="missing"><img src="https://example.com/x.png">');
  assert.deepEqual(collected, {});
});
