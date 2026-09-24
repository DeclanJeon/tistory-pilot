import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryUrl,
  buildEditorUrl,
  collectBodyImageDataUrls,
  inlineBodyImageSources,
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

test('tistory helpers resolve relative html assets from the body directory', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-tistory-relative-image-'));
  const assetDir = path.join(tempRoot, 'assets');
  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(path.join(assetDir, 'hero.png'), Buffer.from('hero'));

  const body = '<figure><img src="assets/hero.png" alt="hero"></figure>';
  const collected = collectBodyImageDataUrls(body, { baseDir: tempRoot });
  assert.match(collected['assets/hero.png'], /^data:image\/png;base64,/);
  assert.match(inlineBodyImageSources(body, collected), /src="data:image\/png;base64,/);
});

test('tistory helpers ignore missing local html assets', () => {
  const collected = collectBodyImageDataUrls('<img src="assets/missing.png" alt="missing"><img src="https://example.com/x.png">');
  assert.deepEqual(collected, {});
});
