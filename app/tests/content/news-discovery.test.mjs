import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterArticles, discoverNewsIssues } from '../../scripts/content/news-discovery.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const NOW = new Date('2026-09-14T12:00:00+09:00');
const recent = (d = '2026-09-13') => `Sun, ${d.slice(8)} Sep 2026 10:00:00 +0900`;

const EMPTY_GATE = { ledger: [], rssTitles: [] };

function naverItem(title, pubDate = recent(), desc = '', url = null) {
  return { raw: title, url: url || `https://news.example.com/${encodeURIComponent(title)}`, metrics: { pubDate, description: desc, provider: 'naver-news' } };
}
function googleItem(title, pubDate = 'Sun, 13 Sep 2026 10:00:00 GMT', outlet = 'TechCrunch', url = null) {
  return { raw: title, url: url || `https://gn.example.com/${encodeURIComponent(title)}`, metrics: { pubDate, outlet, description: '', provider: 'google-news' } };
}

test('clusterArticles: 같은 사건 기사를 하나의 이슈로 묶는다', () => {
  const articles = [
    { title: 'WebRTC 1.0 표준 확정', url: 'a', pubDate: recent() },
    { title: 'WebRTC 1.0 표준 확정 발표', url: 'b', pubDate: recent() },
    { title: 'IPFS 분산 스토리지 업데이트', url: 'c', pubDate: recent() }
  ];
  const clusters = clusterArticles(articles);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].articles.length, 2);
});

test('discoverNewsIssues: P2P 금융 기사를 걸러낸다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  await fs.writeFile(kwPath, JSON.stringify({ keywords: [] }));

  const { report } = await discoverNewsIssues({
    date: '2026-09-14',
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: EMPTY_GATE,
    fetchNaverImpl: async ({ query }) => ({
      items: query === 'P2P 기술'
        ? [naverItem('P2P 대출 연체율 급증', recent(), '온투업 대출 부실 우려'), naverItem('P2P 프로토콜 분산 네트워크 연구', recent(), 'P2P 네트워크 프로토콜')]
        : []
    }),
    fetchGoogleImpl: async () => ({ items: [] }),
    fetchArticleImpl: async () => ''
  });
  assert.equal(report.rejected.finance, 1);
  assert.equal(report.filtered, 1);
});

test('discoverNewsIssues: 7일 지난 기사는 제외한다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  await fs.writeFile(kwPath, JSON.stringify({ keywords: [] }));

  const { report } = await discoverNewsIssues({
    date: '2026-09-14',
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: EMPTY_GATE,
    fetchNaverImpl: async () => ({
      items: [naverItem('WebRTC 업데이트', 'Mon, 01 Sep 2026 10:00:00 +0900', 'WebRTC 프로토콜')]
    }),
    fetchGoogleImpl: async () => ({ items: [] }),
    fetchArticleImpl: async () => ''
  });
  assert.equal(report.rejected.stale, 1);
  assert.equal(report.filtered, 0);
});

test('discoverNewsIssues: keywords.json에 news 엔트리를 등록한다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  await fs.writeFile(kwPath, JSON.stringify({ keywords: [{ id: 'existing-1', keyword: '포장이사 비용', enabled: true }] }));
  const { appended } = await discoverNewsIssues({
    date: '2026-09-14',
    cap: 1,
    apply: true,
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: EMPTY_GATE,
    fetchNaverImpl: async () => ({
      items: [naverItem('WebRTC 화상회의 표준화', recent(), 'WebRTC 프로토콜 표준')]
    }),
    fetchGoogleImpl: async () => ({ items: [googleItem('WebRTC video call standard')] }),
    fetchArticleImpl: async () => 'article body text'
  });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].category, 'IT·테크');
  assert.equal(appended[0].contentType, 'info');
  assert.ok(appended[0].expiresAt > '2026-09-14');
  assert.ok(appended[0].news.articles.length >= 1);

  const saved = JSON.parse(await fs.readFile(kwPath, 'utf8'));
  assert.equal(saved.keywords.length, 2);
});

test('discoverNewsIssues: 이미 등록된 뉴스 이슈는 재등록하지 않는다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  await fs.writeFile(kwPath, JSON.stringify({
    keywords: [{ id: 'news-1', keyword: 'WebRTC 화상회의 표준화', enabled: true, news: { articles: [] } }]
  }));

  const { appended } = await discoverNewsIssues({
    date: '2026-09-14',
    apply: true,
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: EMPTY_GATE,
    fetchNaverImpl: async () => ({
      items: [naverItem('WebRTC 화상회의 표준화', recent(), 'WebRTC 프로토콜')]
    }),
    fetchGoogleImpl: async () => ({ items: [] }),
    fetchArticleImpl: async () => ''
  });
  assert.equal(appended.length, 0);
});

test('discoverNewsIssues: idxno가 다른 같은 언론사 기사는 별개로 인정한다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  await fs.writeFile(kwPath, JSON.stringify({ keywords: [] }));

  const { appended } = await discoverNewsIssues({
    date: '2026-09-14',
    apply: true,
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: EMPTY_GATE,
    fetchNaverImpl: async ({ query }) => ({
      items: query === 'P2P 기술'
        ? [
            naverItem('WebRTC 표준 업데이트 A', recent(), 'WebRTC 프로토콜', 'https://news.example.com/article?idxno=111&utm_source=feed'),
            naverItem('WebRTC 표준 업데이트 B', recent(), 'WebRTC 프로토콜', 'https://news.example.com/article?idxno=222')
          ]
        : []
    }),
    fetchGoogleImpl: async () => ({ items: [] }),
    fetchArticleImpl: async () => ''
  });
  const urls = appended.flatMap(k => k.news.articles.map(a => a.url));
  assert.ok(urls.includes('https://news.example.com/article?idxno=111&utm_source=feed'));
  assert.ok(urls.includes('https://news.example.com/article?idxno=222'));
});

test('discoverNewsIssues: 추적 파라미터만 다른 같은 기사는 dedup한다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  await fs.writeFile(kwPath, JSON.stringify({ keywords: [] }));

  const { appended } = await discoverNewsIssues({
    date: '2026-09-14',
    apply: true,
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: EMPTY_GATE,
    fetchNaverImpl: async ({ query }) => ({
      items: query === 'P2P 기술'
        ? [
            naverItem('WebRTC 표준 업데이트', recent(), 'WebRTC 프로토콜', 'https://news.example.com/article?idxno=111'),
            naverItem('WebRTC 표준 업데이트', recent(), 'WebRTC 프로토콜', 'https://news.example.com/article?idxno=111&utm_source=feed&fbclid=abc')
          ]
        : []
    }),
    fetchGoogleImpl: async () => ({ items: [] }),
    fetchArticleImpl: async () => ''
  });
  const articles = appended.flatMap(k => k.news.articles);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].url, 'https://news.example.com/article?idxno=111');
});

test('discoverNewsIssues: 원장의 기사 소스와 겹치는 이슈는 차단하고 별개 기사는 선정한다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  await fs.writeFile(kwPath, JSON.stringify({ keywords: [] }));

  const ledgerUrl = 'https://news.example.com/article?idxno=999';
  const ledgerGate = {
    ledger: [{ id: 'news-old', keyword: 'WebRTC 과거 이슈', sourceBundle: [{ url: ledgerUrl }] }],
    rssTitles: []
  };
  const { appended } = await discoverNewsIssues({
    date: '2026-09-14',
    apply: true,
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: ledgerGate,
    fetchNaverImpl: async ({ query }) => ({
      items: query === 'P2P 기술'
        ? [
            naverItem('WebRTC 표준화 추진', recent(), 'WebRTC 프로토콜', ledgerUrl),
            naverItem('분산 네트워크 프로토콜 개선', recent(), '분산 네트워크 프로토콜', 'https://news.example.com/article?idxno=777')
          ]
        : []
    }),
    fetchGoogleImpl: async () => ({ items: [] }),
    fetchArticleImpl: async () => ''
  });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].keyword, '분산 네트워크 프로토콜 개선');
});

test('discoverNewsIssues: 기존 키워드의 news.articles URL은 이력으로 간주한다', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'news-test-'));
  const kwPath = path.join(tmp, 'keywords.json');
  const usedUrl = 'https://news.example.com/article?idxno=555';
  await fs.writeFile(kwPath, JSON.stringify({
    keywords: [{ id: 'news-1', keyword: '지난주 다른 이슈', enabled: true, news: { articles: [{ title: 't', url: usedUrl }] } }]
  }));

  const { appended } = await discoverNewsIssues({
    date: '2026-09-14',
    apply: true,
    now: NOW,
    keywordsPath: kwPath,
    duplicateGate: EMPTY_GATE,
    fetchNaverImpl: async ({ query }) => ({
      items: query === 'P2P 기술'
        ? [naverItem('WebRTC 화상회의 표준화', recent(), 'WebRTC 프로토콜', usedUrl)]
        : []
    }),
    fetchGoogleImpl: async () => ({ items: [] }),
    fetchArticleImpl: async () => ''
  });
  assert.equal(appended.length, 0);
});
