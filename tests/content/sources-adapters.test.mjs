import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { validateSourceResult, validateSourceItem } from '../../scripts/content/sources/contract.mjs';
import { buildMerged } from '../../scripts/content/sources/aggregator.mjs';
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