import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  acquireRepresentativeImage,
  buildGoogleImageSearchUrl,
  buildImageSearchQuery,
  inspectImageBuffer,
  isAllowedImageSource,
  parseGoogleImageCandidates
} from '../../src/core/media/image-acquisition.mjs';
function validPngBuffer({ width = 1536, height = 1024, bytes = 4096 } = {}) {
  const data = Buffer.alloc(bytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function response(body, headers = {}) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    async text() { return data.toString(); },
    async arrayBuffer() { return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); }
  };
}

test('image query uses keyword and market tokens, not a generic filename', () => {
  const query = buildImageSearchQuery({
    keyword: '에어컨 청소 비용',
    category: '이사·청소·주거',
    market: { commonTokens: ['30평', '추가요금'] }
  });
  assert.match(query, /에어컨 청소 비용/);
  assert.match(query, /30평/);
  assert.doesNotMatch(query, /editorial home service/);
});
test('Google image search defaults to the Creative Commons usage-rights filter', () => {
  const url = new URL(buildGoogleImageSearchUrl('에어컨 청소'));
  assert.equal(url.searchParams.get('tbm'), 'isch');
  assert.equal(url.searchParams.get('tbs'), 'il:cl');
});

test('image allowlist validates the downloaded image host, not only the referrer page', () => {
  assert.equal(isAllowedImageSource({ imageUrl: 'https://images.unsplash.com/photo.png', sourceUrl: 'https://unsplash.com/photos/abc' }), true);
  assert.equal(isAllowedImageSource({ imageUrl: 'https://evil.example/photo.png', sourceUrl: 'https://unsplash.com/photos/abc' }), false);
  assert.equal(isAllowedImageSource({ imageUrl: 'https://evil.example/photo.png' }, { allowUnverified: true }), true);
});

test('Google image parser keeps original and source URLs from escaped imgres links', () => {
  const candidates = parseGoogleImageCandidates(
    '<a href="/imgres?imgurl=https%3A%2F%2Fimages.unsplash.com%2Fphoto.png&amp;imgrefurl=https%3A%2F%2Funsplash.com%2Fphotos%2Fabc">result</a>'
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].imageUrl, 'https://images.unsplash.com/photo.png');
  assert.equal(candidates[0].sourceUrl, 'https://unsplash.com/photos/abc');
});

test('image validator rejects non-images and accepts a sufficiently sized landscape image', () => {
  assert.equal(inspectImageBuffer(Buffer.alloc(4096)).ok, false);
  const checked = inspectImageBuffer(validPngBuffer());
  assert.equal(checked.ok, true);
  assert.equal(checked.width, 1536);
  assert.equal(checked.height, 1024);
  assert.equal(inspectImageBuffer(validPngBuffer({ width: 100, height: 100 })).reason, 'dimensions-too-small');
});

test('representative acquisition downloads an allowlisted Google result and writes provenance', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tistory-image-google-'));
  const image = validPngBuffer();
  const fetchImpl = async (url) => {
    if (String(url).includes('tbm=isch')) {
      return response('<a href="/imgres?imgurl=https%3A%2F%2Fimages.unsplash.com%2Fphoto.png&amp;imgrefurl=https%3A%2F%2Funsplash.com%2Fphotos%2Fabc">result</a>');
    }
    return response(image, { 'content-type': 'image/png', 'content-length': String(image.length) });
  };
  const result = await acquireRepresentativeImage({
    id: 'move-01',
    keyword: '포장이사 비용',
    category: '이사·청소·주거',
    market: { commonTokens: ['견적'] }
  }, { outDir, fetchImpl, now: new Date('2026-08-27T00:00:00.000Z') });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'google-images');
  assert.equal(result.provenance.licenseVerified, false);
  assert.equal(result.provenance.sourceUrl, 'https://unsplash.com/photos/abc');
  assert.equal((await fs.stat(result.path)).size, image.length);
  assert.equal((await fs.stat(result.provenancePath)).isFile(), true);
});

test('Codex Imagen is the fallback when search has no usable candidate', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tistory-image-imagen-'));
  const script = path.join(outDir, 'codex-imagen.mjs');
  await fs.writeFile(script, '// test helper marker\n');
  const image = validPngBuffer();
  let called = false;
  let imagenArgs = [];
  const result = await acquireRepresentativeImage({
    id: 'life-01',
    keyword: '정수기 렌탈 비용',
    category: '생활·정보'
  }, {
    outDir,
    env: { CODEX_IMAGEN_SCRIPT: script, CODEX_IMAGEN_TIMEOUT_SEC: '1' },
    fetchImpl: async () => response('<html>no image candidates</html>'),
    runImagen: async ({ args, outputPath }) => {
      called = true;
      imagenArgs = args;
      await fs.writeFile(outputPath, image);
      return { code: 0, stdout: JSON.stringify({ paths: [outputPath] }), stderr: '' };
    },
    now: new Date('2026-08-27T00:00:01.000Z')
  });
  assert.equal(called, true);
  assert.deepEqual(imagenArgs.slice(1, 6), ['--json', '--timeout', '1', '--retries', '1']);
  assert.equal(result.ok, true);
  assert.equal(result.method, 'codex-imagen');
  assert.equal(result.provenance.license, 'generated-by-codex-imagen');
});
test('legacy ponslink imagegen helper receives its native Python CLI arguments', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tistory-image-legacy-'));
  const script = path.join(outDir, 'image_gen.py');
  await fs.writeFile(script, '# test helper marker\n');
  const image = validPngBuffer();
  let invocation = null;
  const result = await acquireRepresentativeImage({
    id: 'move-legacy',
    keyword: '포장이사 비용',
    category: '이사·청소·주거'
  }, {
    outDir,
    search: false,
    env: { CODEX_IMAGEN_SCRIPT: script },
    runImagen: async (args) => {
      invocation = args;
      await fs.writeFile(args.outputPath, image);
      return { code: 0, stdout: `Wrote ${args.outputPath}`, stderr: '' };
    },
    now: new Date('2026-08-27T00:00:02.000Z')
  });
  assert.equal(result.ok, true);
  assert.equal(invocation.command, 'python3');
  assert.deepEqual(invocation.args.slice(1, 4), ['generate', '--prompt', invocation.prompt]);
  assert.deepEqual(invocation.args.slice(-7), ['--quality', 'medium', '--size', '1536x1024', '--out', invocation.outputPath, '--force']);
  assert.equal(result.provenance.scriptMode, 'legacy-python-imagegen');
});
