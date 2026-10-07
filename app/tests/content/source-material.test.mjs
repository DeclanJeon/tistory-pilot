/**
 * source-material.mjs 단위 테스트 (설계 §10)
 * SOURCE_ARCHIVE_ROOT를 픽스처로 오버라이드해 실제 아카이브에 의존하지 않는다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stripHeader,
  splitSections,
  loadManifest,
  loadExcerpts,
  buildSourceBlock,
  sourceCitations,
  loadSourceRaw
} from '../../scripts/content/source-material.mjs';

const FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sources');
process.env.SOURCE_ARCHIVE_ROOT = FIXTURE_ROOT;

const KW = {
  id: 'side-test',
  keyword: '쿠팡 위탁판매 하는법',
  category: '부업·재테크',
  contentType: 'guide',
  tags: ['쿠팡', '위탁판매', '부업'],
  sourceMaterial: {
    archive: 'test-archive',
    mode: 'hybrid',
    excerptChars: 4000,
    files: ['쿠팡-위탁판매-테스트.md'],
    videoUrls: ['https://www.youtube.com/watch?v=testvideo123']
  }
};

test('stripHeader는 제목/메타 블록을 제거하고 본문만 남긴다', () => {
  const raw = '# 제목\n\n> **채널:** X\n> **URL:** y\n> **추출일:** 2026-08-20\n\n---\n\n## [00:00]\n본문 내용';
  const body = stripHeader(raw);
  assert.ok(!body.includes('**채널:**'));
  assert.ok(body.includes('본문 내용'));
});

test('splitSections는 타임스탬프 섹션을 분리한다', () => {
  const sections = splitSections('## [00:00]\n첫 번째\n## [01:00]\n두 번째');
  assert.equal(sections.length, 2);
  assert.equal(sections[0].ts, '00:00');
  assert.equal(sections[1].text, '두 번째');
});

test('manifest 누락 시 null (예외 아님)', async () => {
  const m = await loadManifest('없는-아카이브');
  assert.equal(m, null);
});

test('loadExcerpts는 파일 누락을 스킵하고 나머지를 로드한다', async () => {
  const kw = {
    ...KW,
    sourceMaterial: {
      ...KW.sourceMaterial,
      files: ['없는-파일.md', '쿠팡-위탁판매-테스트.md']
    }
  };
  const excerpts = await loadExcerpts(kw);
  assert.ok(excerpts.length >= 1);
  assert.equal(excerpts[0].channel, '테스트채널');
});

test('loadExcerpts는 tags 토큰이 있는 섹션을 우선한다', async () => {
  const excerpts = await loadExcerpts(KW);
  assert.ok(excerpts.length >= 1);
  assert.ok(excerpts[0].text.includes('위탁판매'));
});

test('buildSourceBlock은 인용 마커를 포함하고 excerptChars를 제한한다', async () => {
  const block = await buildSourceBlock({ ...KW, sourceMaterial: { ...KW.sourceMaterial, excerptChars: 60 } });
  assert.ok(block.includes('[출처: 테스트채널'));
  assert.ok(block.length <= 200); // 60자 + 인용 마커
});

test('sourceCitations는 manifest 기반 인용 문자열을 반환한다', async () => {
  const cites = await sourceCitations(KW);
  assert.equal(cites.length, 1);
  assert.ok(cites[0].includes('https://www.youtube.com/watch?v=testvideo123'));
});

test('loadSourceRaw는 헤더 제거된 원문을 반환한다', async () => {
  const raws = await loadSourceRaw(KW.sourceMaterial);
  assert.equal(raws.length, 1);
  assert.ok(!raws[0].text.includes('**채널:**'));
  assert.ok(raws[0].text.includes('쿠팡 위탁판매를 시작하려면'));
});

test('sourceMaterial 없으면 빈 결과 (하위 호환)', async () => {
  assert.equal(await buildSourceBlock({ keyword: '일반 키워드' }), '');
  assert.deepEqual(await loadExcerpts({ keyword: '일반 키워드' }), []);
});
