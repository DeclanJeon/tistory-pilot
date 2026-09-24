import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { validateSourceResult, validateSourceItem } from '../../scripts/content/sources/contract.mjs';
import { buildMerged, runAdapters } from '../../scripts/content/sources/aggregator.mjs';
import { fetchNaverDataLab } from '../../scripts/content/sources/naver-datalab.mjs';
import { decodePty, todayKyungyoDate } from '../../scripts/content/sources/kma-weather.mjs';
import { readCache, writeCache, upsertMetric, viewMetric, buildShadowReport } from '../../scripts/content/metrics-injector.mjs';

test('source contract rejects failures disguised as zero results', () => {
  assert.throws(() => validateSourceResult({ source: 'nope', status: 'ok', items: [] }));
  // 실패는 0건 items + unavailable status 로 표현해야 한다
  const unavail = validateSourceResult({ source: 'naver-datalab', status: 'unavailable', items: [], error: '키 없음' });
  assert.equal(unavail.status, 'unavailable');
  assert.equal(unavail.error, '키 없음');
  assert.equal(unavail.items.length, 0);
});

test('naver datalab sends keyword arrays accepted by the API schema', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          results: request.body.keywordGroups.map((group) => ({
            title: group.groupName,
            data: [{ period: '2026-08-27', ratio: 42 }]
          }))
        };
      }
    };
  };
  try {
    const usageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tistory-datalab-'));
    const result = await fetchNaverDataLab({
      env: {
        NAVER_DATALAB_CLIENT_ID: 'test-id',
        NAVER_DATALAB_CLIENT_SECRET: 'test-secret',
        NAVER_DATALAB_KEYWORDS: '이사 비용,청소 비용'
      },
      usageFile: path.join(usageDir, 'usage.json'),
      now: new Date('2026-08-27T00:00:00.000Z')
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.items.length, 2);
    assert.deepEqual(request.body.keywordGroups, [
      { keywords: ['이사 비용'], groupName: '이사 비용' },
      { keywords: ['청소 비용'], groupName: '청소 비용' }
    ]);
    assert.equal(request.options.headers['X-Naver-Client-Id'], 'test-id');
    assert.equal(request.options.headers['X-Naver-Client-Secret'], 'test-secret');
    const usage = JSON.parse(await fs.readFile(path.join(usageDir, 'usage.json'), 'utf8'));
    assert.equal(usage.months['2026-08'].requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('naver datalab does not invent a static seed when no keywords are configured', async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('network must not be called without dynamic seeds');
  };
  try {
    const result = await fetchNaverDataLab({
      env: {
        NAVER_DATALAB_CLIENT_ID: 'test-id',
        NAVER_DATALAB_CLIENT_SECRET: 'test-secret'
      }
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.items.length, 0);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('naver datalab blocks requests at the hard monthly quota before network access', async () => {
  const usageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tistory-datalab-quota-'));
  const usageFile = path.join(usageDir, 'usage.json');
  await fs.writeFile(usageFile, JSON.stringify({
    version: 1,
    months: { '2026-09': { requests: 50_000, updatedAt: '2026-09-09T00:00:00.000Z' } }
  }));
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('network must not be called at the monthly cap');
  };
  try {
    const result = await fetchNaverDataLab({
      env: {
        NAVER_DATALAB_CLIENT_ID: 'test-id',
        NAVER_DATALAB_CLIENT_SECRET: 'test-secret'
      },
      keywords: ['현재 인기 검색어'],
      usageFile,
      monthlyLimit: 999_999,
      now: new Date('2026-09-09T00:00:00.000Z')
    });
    assert.equal(result.status, 'rate_limited');
    assert.match(result.error, /50,?000/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('aggregator derives Naver provider seeds from the current trend snapshot', async () => {
  const providerCalls = [];
  const adapters = [
    {
      label: 'google-trends',
      run: async () => ({
        source: 'google-trends',
        status: 'ok',
        items: [
          { raw: '현재 인기 검색어', normalized: '현재 인기 검색어', volume: 50000, volumeKind: 'range' }
        ]
      })
    },
    {
      label: 'naver-datalab',
      run: async (env, keywords) => {
        providerCalls.push({ source: 'naver-datalab', keywords });
        return { source: 'naver-datalab', status: 'ok', items: [] };
      }
    },
    {
      label: 'kma-weather',
      run: async () => ({
        source: 'kma-weather',
        status: 'ok',
        items: [{ raw: '기상: 여름 날씨', normalized: '기상: 여름 날씨', volume: null, volumeKind: 'unknown' }]
      })
    }
  ];
  const results = await runAdapters({ env: {}, adapters });
  assert.deepEqual(providerCalls, [
    { source: 'naver-datalab', keywords: ['현재 인기 검색어', '여름 날씨'] }
  ]);
  assert.deepEqual(results.map((result) => result.source), ['google-trends', 'naver-datalab', 'kma-weather']);
});

test('source item preserves volumeKind, rank and trigger; normalizes volume', () => {
  const item = validateSourceItem({ raw: '제습기', volume: 50000, volumeKind: 'range', rank: 2, trigger: true });
  assert.equal(item.volume, 50000);
  assert.equal(item.volumeKind, 'range');
  assert.equal(item.rank, 2);
  assert.equal(item.trigger, true);
  const noVolume = validateSourceItem({ raw: '한파' });
  assert.equal(noVolume.volume, null);
  assert.equal(noVolume.volumeKind, 'unknown');
});

test('aggregator merges the same normalized keyword across sources (multi signal)', () => {
  const results = [
    { source: 'google-trends', status: 'ok', items: [{ raw: '제습기', normalized: '제습기', volume: 50000, volumeKind: 'range' }] },
    { source: 'kma-weather', status: 'ok', items: [{ raw: '기상: 제습기', normalized: '제습기', trigger: true }] },
    { source: 'naver-datalab', status: 'unavailable', items: [] }
  ];
  const { sourceStatus, merged } = buildMerged(results);
  assert.equal(sourceStatus['naver-datalab'], 'unavailable');
  const 제습기 = merged.find((m) => m.normalized === '제습기');
  assert.ok(제습기);
  assert.equal(제습기.sourceCount, 2);
  assert.equal(제습기.multi, true);
  assert.equal(제습기.trigger, true);
});

test('kma decodes precipitation codes to rainfall labels', () => {
  assert.equal(decodePty('1'), 'rain');
  assert.equal(decodePty('2'), 'rain-snow');
  assert.equal(decodePty('4'), 'shower');
  assert.equal(decodePty('0'), null);
  assert.equal(typeof todayKyungyoDate(1), 'string');
});

test('metrics cache preserves provenance and distinguishes measured/stale/unavailable', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'metrics-cache-'));
  const file = path.join(tmp, 'metrics-cache.json');
  let cache = await readCache(file);
  upsertMetric(cache, '에어컨 청소 비용', { monthlySearch: 8000, cpcKrw: 2500, provider: 'google-ads' });
  await writeCache(cache, file);
  cache = await readCache(file);

  const measured = viewMetric(cache, '에어컨 청소 비용');
  assert.equal(measured.kind, 'measured');
  assert.equal(measured.provider, 'google-ads');
  assert.equal(measured.monthlySearch, 8000);
  assert.ok(measured.expiresAt);

  assert.equal(viewMetric(cache, '존재하지 않는 키워드').kind, 'unavailable');
});

test('shadow report marks measurement impact for measured candidates only', () => {
  const cache = { metrics: {} };
  upsertMetric(cache, '정수기 렌탈 위약금', { monthlySearch: 3000, cpcKrw: 1500, provider: 'google-ads' });
  const candidates = [
    { id: 'life-01', keyword: '정수기 렌탈 위약금', category: '생활·정보', score: { intent: 8 }, metrics: { checkedAt: null } },
    { id: 'move-01', keyword: '포장이사 비용', category: '이사·청소·주거', score: { intent: 8 }, metrics: { checkedAt: null } }
  ];
  const report = buildShadowReport(candidates, cache, { now: new Date('2026-08-27T00:00:00.000Z') });
  assert.equal(report.candidateCount, 2);
  assert.equal(report.measuredCount, 1);
  assert.equal(report.unavailableCount, 1);
  const measuredRow = report.rows.find((r) => r.keyword === '정수기 렌탈 위약금');
  assert.equal(measuredRow.metricView.kind, 'measured');
  assert.ok(measuredRow.measurementImpact > 0, 'measured CPC/volume must raise the signal');
});