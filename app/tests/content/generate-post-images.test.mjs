import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATED_HERO_IMAGE_SRC,
  repairBodyImageSources
} from '../../scripts/content/generate-post.mjs';

async function makeFixture() {
  const htmlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gen-post-body-'));
  const imageDir = path.join(htmlDir, '..', 'images');
  await fs.mkdir(imageDir, { recursive: true });
  const thumbnailPath = path.join(imageDir, 'aip2p-21-1790565750594.png');
  await fs.writeFile(thumbnailPath, Buffer.from('png-bytes'));
  return { htmlDir, thumbnailPath };
}

test('repairBodyImageSources replaces GENERATED_HERO_IMAGE placeholder with the real thumbnail path', async () => {
  const { htmlDir, thumbnailPath } = await makeFixture();
  const html = [
    '<div><h1>제목</h1>',
    `<figure><img src="${GENERATED_HERO_IMAGE_SRC}" alt="키워드 개념을 나타내는 이미지"><figcaption>개념을 나타내는 이미지</figcaption></figure>`,
    '</div>'
  ].join('');

  const repaired = await repairBodyImageSources(html, { thumbnailPath, htmlDir });
  const expected = path.relative(htmlDir, thumbnailPath).split(path.sep).join('/');
  assert.ok(repaired.includes(`src="${expected}"`));
  assert.equal(repaired.includes(GENERATED_HERO_IMAGE_SRC), false);
  // 자리표시자 치환은 src만 바꾸고 alt/figcaption은 그대로 둔다.
  assert.ok(repaired.includes('alt="키워드 개념을 나타내는 이미지"'));
  assert.ok(repaired.includes('<figcaption>개념을 나타내는 이미지</figcaption>'));
  // 실제 파일로 확인 가능해야 한다 (htmlDir 기준 상대 경로).
  const resolved = path.resolve(htmlDir, expected);
  assert.ok(await fs.access(resolved).then(() => true).catch(() => false));
});

test('repairBodyImageSources rejects invented local src even when a thumbnail exists', async () => {
  const { htmlDir, thumbnailPath } = await makeFixture();
  const html = '<figure><img src="api-key-creation.png" alt="지어낸 스크린샷"></figure>';
  await assert.rejects(
    () => repairBodyImageSources(html, { thumbnailPath, htmlDir }),
    /존재하지 않는 로컬 이미지 경로.*api-key-creation\.png/
  );
});

test('repairBodyImageSources rejects placeholder when the thumbnail is missing', async () => {
  const { htmlDir, thumbnailPath } = await makeFixture();
  const html = `<figure><img src="${GENERATED_HERO_IMAGE_SRC}" alt="hero"></figure>`;
  await assert.rejects(
    () => repairBodyImageSources(html, { thumbnailPath: '', htmlDir }),
    /GENERATED_HERO_IMAGE/
  );
  await assert.rejects(
    () => repairBodyImageSources(html, { thumbnailPath: path.join(htmlDir, 'nope.png'), htmlDir }),
    /GENERATED_HERO_IMAGE/
  );
  // 통과 케이스 확인용 (파일 존재)
  await repairBodyImageSources(html, { thumbnailPath, htmlDir });
});

test('repairBodyImageSources keeps remote, data, and existing local images untouched', async () => {
  const { htmlDir, thumbnailPath } = await makeFixture();
  await fs.writeFile(path.join(htmlDir, 'existing.png'), Buffer.from('existing'));

  const html = [
    '<img src="https://example.com/remote.png" alt="remote">',
    '<img src="data:image/png;base64,AAAA" alt="data">',
    '<img src="existing.png" alt="local">'
  ].join('');

  const repaired = await repairBodyImageSources(html, { thumbnailPath, htmlDir });
  assert.equal(repaired, html);
});
