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

test('collectBodyImageDataUrls reports unresolved local image paths instead of dropping them', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-tistory-helpers-'));
  const missing = [];
  const body = [
    '<p>intro</p>',
    '<img src="api-key-creation.png" alt="API 키 생성 화면 예시" style="max-width:100%;height:auto;">',
    '<img src="https://example.com/remote.png" alt="remote">',
    '<img src="data:image/png;base64,AAAA" alt="inline">'
  ].join('\n');

  const collected = collectBodyImageDataUrls(body, {
    baseDir: tempRoot,
    onMissing: (src, tried) => missing.push({ src, tried })
  });

  // 로컬 경로는 해석되지 않았지만 그냥 버려지지 않고 onMissing으로 표면화된다.
  assert.equal(collected['api-key-creation.png'], undefined);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].src, 'api-key-creation.png');
  assert.ok(missing[0].tried.some(candidate => candidate.endsWith('api-key-creation.png')));

  // 원격/data URL 은 missing 으로 잡히지 않는다.
  assert.equal(missing.some(entry => entry.src.includes('example.com')), false);
});

test('collectBodyImageDataUrls resolves local image relative to baseDir and clears missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-tistory-helpers-'));
  await fs.writeFile(path.join(tempRoot, 'api-key-creation.png'), Buffer.from('png-bytes'));

  const missing = [];
  const body = '<p><img src="api-key-creation.png" alt="shot"></p>';
  const collected = collectBodyImageDataUrls(body, {
    baseDir: tempRoot,
    onMissing: src => missing.push(src)
  });

  assert.match(collected['api-key-creation.png'], /^data:image\/png;base64,/);
  assert.equal(missing.length, 0);

  const inlined = inlineBodyImageSources(body, collected);
  assert.match(inlined, /src="data:image\/png;base64,/);
  assert.equal(inlined.includes('api-key-creation.png'), false);
});

test('inlineBodyImageSources leaves remote and unresolved sources untouched', () => {
  const body = '<p><img src="https://example.com/a.png"><img src="missing.png"></p>';
  const inlined = inlineBodyImageSources(body, {});
  assert.ok(inlined.includes('https://example.com/a.png'));
  assert.ok(inlined.includes('missing.png'));
});
