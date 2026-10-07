import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isAlreadyPublished, loadPublishedLedger, appendPublishedLedger } from '../../scripts/lib/published-posts.mjs';

const published = {
  id: 'publish-post-legacy-job',
  title: "몸값 1조 '엘리스그룹' IPO 도전, AI 데이터센터로 풀스택 플랫폼 기업 발돋움 시도",
  keyword: "몸값 1조 '엘리스그룹' IPO 도전",
  url: 'https://acstory.tistory.com/1103'
};

test('RSS unavailable: legacy job IDs still block the published news topic', () => {
  const result = isAlreadyPublished({
    id: 'news-20261001-07',
    keyword: "몸값 1조 '엘리스그룹' IPO 도전",
    title: "몸값 1조 원 '엘리스그룹' IPO 도전, 코스닥 상장 앞두고 AI 인프라 사업으로 판 키운다"
  }, { ledger: [published], rssTitles: [] });
  assert.equal(result.matched, true);
  assert.equal(result.source, 'ledger');
  assert.equal(result.against.url, published.url);
});

test('a changed keyword ID and title cannot republish the original keyword', () => {
  const result = isAlreadyPublished({ id: 'new-id', keyword: 'WebRTC 네트워크 보안', title: '브라우저 통신을 안전하게 만드는 방법' }, {
    ledger: [{ id: 'old-id', keyword: 'WebRTC 네트워크 보안', title: '브라우저 실시간 통신의 보안 기초' }], rssTitles: []
  });
  assert.equal(result.matched, true);
});

test('title-only submissions cannot bypass topic matching with a synthetic ID', () => {
  const result = isAlreadyPublished({ id: 'fresh-job', title: "몸값 1조 '엘리스그룹' IPO 도전…AI 데이터센터 사업 확대가 관건" }, {
    ledger: [published], rssTitles: []
  });
  assert.equal(result.matched, true);
});

test('unrelated new topics remain publishable when RSS is unavailable', () => {
  const result = isAlreadyPublished({ id: 'news-new', keyword: 'WebRTC 브라우저 영상통화 표준 업데이트', title: 'WebRTC 영상통화 표준 업데이트 발표' }, {
    ledger: [published], rssTitles: []
  });
  assert.equal(result.matched, false);
});

test('same keyword ID blocks a completely rewritten title', () => {
  const result = isAlreadyPublished({ id: 'news-20261001-07', keyword: '인프라 시장 변화', title: '교육 플랫폼 기업의 새로운 전략' }, {
    ledger: [{ ...published, id: 'news-20261001-07' }], rssTitles: []
  });
  assert.equal(result.matched, true);
  assert.equal(result.rule, 'ledger-id');
});

test('same news article blocks rewritten headlines but preserves meaningful article identifiers', () => {
  const gate = { ledger: [{ id: 'news-old', keyword: '기존 발표', sourceBundle: [{ url: 'http://news.example/article?idxno=123&utm_source=rss' }] }] };
  assert.equal(isAlreadyPublished({ id: 'news-new', keyword: '완전히 다른 제목', news: { articles: [{ url: 'https://news.example/article?utm_campaign=new&idxno=123#top' }] } }, gate).rule, 'news-source');
  assert.equal(isAlreadyPublished({ id: 'news-next', keyword: '별개의 신규 사건', news: { articles: [{ url: 'https://news.example/article?idxno=124' }] } }, gate).matched, false);
  assert.equal(isAlreadyPublished({ id: 'guide-new', keyword: '별개의 신규 사건', sourceBundle: [{ url: 'https://news.example/article?idxno=123' }] }, gate).matched, false);
});

test('corrupted publication history stops rather than permitting repeat publication', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'published-corrupt-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = path.join(root, 'ledger.json');
  await fs.writeFile(filename, '{broken');
  await assert.rejects(loadPublishedLedger(filename), SyntaxError);
  await fs.writeFile(filename, '{"posts":null}');
  await assert.rejects(loadPublishedLedger(filename), /Invalid publication ledger/);
});

test('actual duplicate publication evidence is retained by URL rather than discarded by topic ID', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'published-evidence-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = path.join(root, 'ledger.json');
  await appendPublishedLedger({ id: 'news-old', url: 'https://blog.example/1', sourceBundle: [{ url: 'https://news.example/article?idxno=123' }] }, filename);
  await appendPublishedLedger({ id: 'news-old', url: 'https://blog.example/2' }, filename);
  await appendPublishedLedger({ id: 'news-old', url: 'https://blog.example/2' }, filename);
  const entries = await loadPublishedLedger(filename);
  assert.deepEqual(entries.map(e => e.url), ['https://blog.example/1', 'https://blog.example/2']);
  assert.equal(isAlreadyPublished({ id: 'news-new', news: { articles: [{ url: 'https://news.example/article?idxno=123' }] } }, { ledger: entries }).rule, 'news-source');
});

test('creative tutorials compare their specific subject rather than the shared AI category', () => {
  const ledger = [{
    id: 'ai-video-cat-buddy-smoke',
    keyword: '고양이 AI 영상 제작',
    title: '고양이 AI 영상 제작 실습: 두 고양이 버디 코미디 10초 씬 설계법'
  }];
  const ad = {
    id: 'ai-video-fictional-ad',
    contentTrack: 'ai-video',
    keyword: 'AI 광고 영상 제작',
    title: '가상 향수 광고 실습: 빗방울에서 유리병으로 전환하는 매크로 콘티'
  };
  assert.equal(isAlreadyPublished(ad, { ledger }).matched, false);
  assert.equal(isAlreadyPublished({ ...ad, contentTrack: null }, { ledger }).matched, true);
});

test('creative classification does not permit repeated or lightly rewritten tutorial subjects', () => {
  const original = {
    id: 'ai-video-cat-original', contentTrack: 'ai-video',
    keyword: '고양이 AI 영상 제작',
    title: '고양이 AI 영상 제작 실습: 두 고양이 버디 코미디 10초 씬 설계법'
  };
  const ledger = [original];
  assert.equal(isAlreadyPublished({ ...original, id: 'ai-video-cat-copy' }, { ledger }).matched, true);
  assert.equal(isAlreadyPublished({
    ...original, id: 'ai-video-cat-reworded',
    title: '두 고양이 버디 코미디 10초 씬 설계법과 AI 영상 제작 실습'
  }, { ledger }).matched, true);
  assert.equal(isAlreadyPublished({
    ...original, keyword: '완전히 다른 소재', title: '새로운 제목'
  }, { ledger }).rule, 'ledger-id');
});

test('creative SEO category prefixes do not hide distinct recipe subjects in ledger or RSS', () => {
  const original = {
    id: 'ai-video-perfume', keyword: 'AI 광고 영상 제작',
    title: 'AI 광고 영상 제작: 향수병 빗방울 매크로 콘티'
  };
  const candidate = {
    id: 'ai-video-paper-shoe', contentTrack: 'ai-video', keyword: original.keyword,
    title: 'AI 광고 영상 제작: 종이 운동화가 접히는 스톱모션 설계'
  };
  assert.equal(isAlreadyPublished(candidate, { ledger: [original] }).matched, false);
  assert.equal(isAlreadyPublished(candidate, { rssTitles: [original] }).matched, false);
  assert.equal(isAlreadyPublished({ ...candidate, contentTrack: null }, { ledger: [original] }).matched, true);
  const replay = { ...candidate, title: 'AI 광고 영상 제작: 빗방울 매크로 향수병 콘티 실습' };
  assert.equal(isAlreadyPublished(replay, { ledger: [original] }).matched, true);
});
