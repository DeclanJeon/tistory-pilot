#!/usr/bin/env node
/**
 * Google Trends/KMA are collected first without a keyword seed. Naver
 * DataLab then receives the fresh interests from that snapshot (or an
 * explicit operator override). Source failures remain explicit.
 *
 * 통합 규칙:
 *  - normalizeTitle 로 같은 키워드를 소스 간 병합한다.
 *  - 동일 키워드가 여러 소스에 있으면 출처 목록을 합치되, volume 은 소스별 raw 를
 *    volumeKind 와 함께 그대로 보존한다 (교차 가중치를 단순 합산하지 않음).
 *  - sourceCount >= 2 이면 'multi' 플래그를 세운다 (시너지 신호, 점수 입장은 후단).
 *
 * 출력: content/learning/shadow-sources-<date>.json (Shadow, 발행 경로 비침해)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateSourceResult } from './contract.mjs';
import { fetchGoogleTrends } from './google-trends.mjs';
import { fetchNaverDataLab } from './naver-datalab.mjs';
import { fetchKmaWeather } from './kma-weather.mjs';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SHADOW_DIR = path.join(PROJECT_ROOT, 'content', 'learning');

const ADAPTERS = [
  { label: 'google-trends', run: (env) => fetchGoogleTrends({ env }) },
  { label: 'naver-datalab', run: (env, keywords) => fetchNaverDataLab({ env, keywords }) },
  { label: 'kma-weather', run: (env) => fetchKmaWeather({ env }) }
];
function parseKeywordList(value) {
  return (Array.isArray(value) ? value : String(value || '').split(','))
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function cleanDynamicSeed(value) {
  return String(value || '')
    .replace(/^기상\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveDynamicSeedKeywords(results, limit = 5) {
  const priority = ['google-trends', 'kma-weather'];
  const ordered = [
    ...priority.map((source) => results.find((result) => result.source === source)).filter(Boolean),
    ...results.filter((result) => !priority.includes(result.source))
  ];
  const seen = new Set();
  const seeds = [];
  for (const result of ordered) {
    for (const item of result.items || []) {
      const seed = cleanDynamicSeed(item.normalized || item.raw);
      const key = seed.toLowerCase();
      if (!seed || seed.length < 2 || seen.has(key)) continue;
      seen.add(key);
      seeds.push(seed);
      if (seeds.length >= limit) return seeds;
    }
  }
  return seeds;
}

function providerKeywords(env, dynamicSeeds) {
  const specific = parseKeywordList(env.NAVER_DATALAB_KEYWORDS);
  if (specific.length) return specific;
  const operatorSeeds = parseKeywordList(env.MARKET_SEED_KEYWORDS);
  return operatorSeeds.length ? operatorSeeds : dynamicSeeds;
}

function sourceGroup(adapter, seededLabels) {
  return seededLabels.has(adapter.label) ? 'seeded' : 'seedless';
}

async function runAdapterGroup(active, env, bySource, { dynamicSeeds = [] } = {}) {
  const settled = await Promise.allSettled(active.map((adapter) => {
    const keywords = adapter.label === 'naver-datalab'
      ? providerKeywords(env, dynamicSeeds)
      : null;
    return adapter.run(env, keywords);
  }));
  for (let i = 0; i < active.length; i++) {
    const label = active[i].label;
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      try {
        bySource.set(label, validateSourceResult(outcome.value));
      } catch (error) {
        bySource.set(label, validateSourceResult({
          source: label,
          status: 'error',
          items: [],
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    } else {
      bySource.set(label, validateSourceResult({
        source: label,
        status: 'error',
        items: [],
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      }));
    }
  }
}

export async function runAdapters({ env = process.env, skip = [], adapters = ADAPTERS } = {}) {
  const skipped = new Set(skip);
  const selected = adapters.filter((adapter) => !skipped.has(adapter.label));
  const bySource = new Map();
  const seededLabels = new Set(['naver-datalab']);

  // Trend/interest sources do not need a static seed and run first.
  await runAdapterGroup(
    selected.filter((adapter) => sourceGroup(adapter, seededLabels) === 'seedless'),
    env,
    bySource
  );
  const dynamicSeeds = deriveDynamicSeedKeywords([...bySource.values()]);

  // DataLab receives the interests observed in this same run.
  await runAdapterGroup(
    selected.filter((adapter) => sourceGroup(adapter, seededLabels) === 'seeded'),
    env,
    bySource,
    { dynamicSeeds }
  );

  return selected.map((adapter) => bySource.get(adapter.label)).filter(Boolean);
}

export function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


export function buildMerged(results) {
  const byKeyword = new Map();
  const sourceStatus = {};
  for (const result of results) {
    sourceStatus[result.source] = result.status;
    for (const item of result.items) {
      const key = item.normalized || item.raw;
      if (!key) continue;
      if (!byKeyword.has(key)) {
        byKeyword.set(key, { normalized: key, sources: [], trigger: item.trigger === true });
      }
      const entry = byKeyword.get(key);
      entry.sources.push({
        source: result.source,
        raw: item.raw,
        volume: item.volume,
        volumeKind: item.volumeKind,
        rank: item.rank,
        url: item.url,
        ...(item.metrics ? { metrics: item.metrics } : {}),
        trigger: item.trigger === true
      });
      if (item.trigger === true) entry.trigger = true;
    }
  }
  return {
    sourceStatus,
    merged: [...byKeyword.values()].map((entry) => ({
      ...entry,
      sourceCount: entry.sources.length,
      multi: entry.sources.length >= 2
    }))
  };
}

export async function runShadow({ date = todayDate(), outDir = SHADOW_DIR } = {}) {
  const results = await runAdapters();
  const { sourceStatus, merged } = buildMerged(results);
  const snapshot = {
    date,
    fetchedAt: new Date().toISOString(),
    sourceStatus,
    sources: results.map((r) => ({
      source: r.source,
      status: r.status,
      fetchedAt: r.fetchedAt,
      expiresAt: r.expiresAt,
      itemCount: r.items.length,
      error: r.error
    })),
    mergedKeywordCount: merged.length,
    multiSourceCount: merged.filter((m) => m.multi).length,
    merged
  };
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `shadow-sources-${date}.json`);
  await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  return { snapshot, outPath };
}

// CLI
const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('aggregator.mjs')) {
  runShadow().then(({ snapshot, outPath }) => {
    console.log(`[aggregator] Shadow 스냅샷 저장: ${outPath}`);
    for (const key of Object.keys(snapshot.sourceStatus)) {
      console.log(`  - ${key}: ${snapshot.sourceStatus[key]}`);
    }
    console.log(`  - 병합 키워드: ${snapshot.mergedKeywordCount} (multi ${snapshot.multiSourceCount})`);
  }).catch((error) => {
    console.error(`[aggregator] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}