#!/usr/bin/env node
/**
 * sources/aggregator.mjs — 다중 소스 수집기 + Shadow 통합 (설계 §3.1)
 *
 * 각 adapter를 Promise.allSettled 로 병렬 실행하고 표준 contract로 검증한다.
 * 소스 실패는 '0건'으로 치환하지 않는다 — status 가 unavailable/rate_limited/error 로
 * snapshot 에 보존된다.
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
  { label: 'naver-datalab', run: (env) => fetchNaverDataLab({ env }) },
  { label: 'kma-weather', run: (env) => fetchKmaWeather({ env }) }
];

export function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function runAdapters({ env = process.env, skip = [] } = {}) {
  const active = ADAPTERS.filter((a) => !skip.includes(a.label));
  const settled = await Promise.allSettled(active.map((a) => a.run(env)));
  const results = [];
  for (let i = 0; i < active.length; i++) {
    const label = active[i].label;
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      try {
        results.push(validateSourceResult(outcome.value));
      } catch (error) {
        results.push(validateSourceResult({
          source: label,
          status: 'error',
          items: [],
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    } else {
      results.push(validateSourceResult({
        source: label,
        status: 'error',
        items: [],
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      }));
    }
  }
  return results;
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