import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  collectMarketCandidates,
  discoverMarketKeywords,
  popularityScore,
  scoreMarketCandidate
} from '../../scripts/content/market-discovery.mjs';
import { fetchNaverSearchAds, buildNaverSearchAdsSignature } from '../../scripts/content/sources/naver-search-ads.mjs';

const market = {
  keyword: '에어컨 청소 비용',
  intent: 'commercial',
  cpcTier: 'A',
  sampleCount: 5,
  avgTitleLength: 31,
  topHookLabels: ['가이드형'],
  commonTokens: ['추가요금', '30평'],
  competitors: [],
  deepSamples: [],
  serpGap: { total: 12, rawTotal: 12, signals: { priceTableMissing: true } },
  recommendations: ['가격표를 넣어라']
};

function sourceResults() {
  return [
    {
      source: 'google-trends',
      status: 'ok',
      items: [{ raw: '에어컨 청소', normalized: '에어컨 청소', volume: 50000, volumeKind: 'range', rank: 2, url: 'https://trends.google.co.kr' }]
    },
    {
      source: 'naver-search-ads',
      status: 'ok',
      items: [{
        raw: '에어컨 청소 비용',
        normalized: '에어컨 청소 비용',
        volume: 4600,
        volumeKind: 'absolute',
        metrics: {
          monthlySearch: 4600,
          cpcKrw: 1500,
          provider: 'naver-search-ads',
          checkedAt: '2026-08-27T00:00:00.000Z',
          volumeKind: 'absolute'
        }
      }]
    }
  ];
}

test('market candidates retain multi-source evidence and expand trend cores commercially', () => {
  const candidates = collectMarketCandidates(sourceResults());
  const row = candidates.find((candidate) => candidate.keyword === '에어컨 청소 비용');
  assert.ok(row);
  assert.ok(row.evidence.some((entry) => entry.source === 'google-trends'));
  assert.ok(row.evidence.some((entry) => entry.source === 'naver-search-ads'));
});

test('popularity score distinguishes measured absolute demand from an empty provider', () => {
  const measured = popularityScore({ evidence: [{ source: 'naver-search-ads', volume: 4600, volumeKind: 'absolute' }] });
  const unavailable = popularityScore({ evidence: [] });
  assert.ok(measured > unavailable);
  assert.equal(unavailable, 0);
});

test('market scoring preserves absolute metrics and applies existing safety gates', () => {
  const candidate = collectMarketCandidates(sourceResults()).find((row) => row.keyword === '에어컨 청소 비용');
  const scored = scoreMarketCandidate(candidate, market, { focusCategories: ['이사·청소·주거'] });
  assert.equal(scored.confidence, 'measured');
  assert.equal(scored.metrics.monthlySearch, 4600);
  assert.equal(scored.metrics.cpcKrw, 1500);
  assert.equal(scored.gates.focus.allowed, true);
  assert.ok(scored.marketScore > 0);
});

test('market discovery is dry-run by default and applies only with explicit apply', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tistory-market-discovery-'));
  const keywordsPath = path.join(tempRoot, 'keywords.json');
  const reportPath = path.join(tempRoot, 'learning', 'market.json');
  const keywordsData = { version: 2, focusCategories: ['이사·청소·주거'], allowLegacySeries: false, keywords: [] };
  const researchFn = async (keyword) => ({ ...market, keyword });
  const common = {
    date: '2026-08-27',
    cap: 1,
    maxCandidates: 8,
    adapterResults: sourceResults(),
    researchFn,
    duplicateGate: { ledger: [], rssTitles: [] },
    keywordsPath,
    keywordsData,
    reportPath,
    now: new Date('2026-08-27T00:00:00.000Z')
  };

  const dryRun = await discoverMarketKeywords({ ...common, apply: false });
  assert.equal(dryRun.appended.length, 0);
  assert.deepEqual((await fs.readFile(keywordsPath).catch(() => Buffer.from(''))).toString(), '');

  const applied = await discoverMarketKeywords({ ...common, apply: true });
  assert.equal(applied.appended.length, 1);
  const saved = JSON.parse(await fs.readFile(keywordsPath, 'utf8'));
  assert.equal(saved.keywords.length, 1);
  assert.equal(saved.keywords[0].source, 'market-discovery');
  assert.equal(saved.keywords[0].metrics.source, 'naver-search-ads');
  assert.equal(saved.keywords[0].marketDiscovery.confidence, 'measured');
  assert.equal((await fs.readFile(path.join(tempRoot, 'learning', 'market-discovery-2026-08-27.selected.txt'), 'utf8')).trim(), saved.keywords[0].id);
});

test('Naver Search Ads adapter preserves unavailable status without credentials', async () => {
  const result = await fetchNaverSearchAds({ env: {} });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.items.length, 0);
  assert.match(result.error, /미등록/);
});

test('Naver Search Ads signature follows timestamp.method.uri HMAC contract', () => {
  assert.equal(
    buildNaverSearchAdsSignature('1', 'GET', '/keywordstool', 's'),
    'f7JlVI37ySg8DNppw5CA0Df9S551xYgSju0T297SQdM='
  );
});

test('Naver Search Ads adapter emits absolute volume and CPC with signed request headers', async () => {
  let request = null;
  const result = await fetchNaverSearchAds({
    env: {
      NAVER_SEARCHADS_API_KEY: 'api-key',
      NAVER_SEARCHADS_SECRET: 'secret',
      NAVER_SEARCHADS_CUSTOMER_ID: 'customer'
    },
    keywords: ['에어컨 청소'],
    now: 1720000000000,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            keywordList: [{
              relKeyword: '에어컨 청소 비용',
              monthlyPcQcCnt: '1,200',
              monthlyMobileQcCnt: '3,400',
              monthlyAvePcCost: 1200,
              monthlyAveMobileCost: 1800,
              compIdx: '높음'
            }]
          };
        }
      };
    }
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.items[0].volumeKind, 'absolute');
  assert.equal(result.items[0].metrics.monthlySearch, 4600);
  assert.equal(result.items[0].metrics.cpcKrw, 1500);
  assert.equal(request.options.headers['X-Timestamp'], '1720000000000');
  assert.equal(request.options.headers['X-Signature'], buildNaverSearchAdsSignature('1720000000000', 'GET', '/keywordstool', 'secret'));
  assert.equal(new URL(request.url).searchParams.get('hintKeywords'), '에어컨 청소');
});
