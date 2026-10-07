#!/usr/bin/env node
/**
 * metrics-injector.mjs — 키워드 실측(CPC·검색량) provenance 캐시 + Shadow 비교 (설계 §3.2)
 *
 * 원칙:
 *  - 실패/미측정을 숫자 0으로 쓰지 않는다 → null + method:'unavailable'/'stale'.
 *  - 캐시는 content/learning/metrics-cache.json (provenance 포함).
 *  - 각 값에 provider/fetchedAt/expiresAt/method/confidence 를 붙인다.
 *  - 기본 TTL 7일.
 *
 * Shadow 용도: 현재 selectionScore(갭·bid·volume=0 기반)와
 * 실측 반영 후 score 를 비교해 '측정이 선정 순서를 얼마나 바꾸는지' 리포트한다.
 * 발행 경로에는 아직 반영하지 않는다 (Phase 2에서 전환).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { computeSelectionScore, scoreBid, scoreVolume, normalizeGapScore, freshnessFactor, measuredSelectionBonus } from './keyword-score.mjs';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CACHE_PATH = process.env.METRICS_CACHE_PATH
  || path.join(PROJECT_ROOT, 'content', 'learning', 'metrics-cache.json');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── 캐시 읽기/쓰기 ──────────────────────────────────────────────────
export async function readCache(filePath = CACHE_PATH) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && data.metrics ? data : { metrics: {} };
  } catch {
    return { metrics: {} };
  }
}

export async function writeCache(cache, filePath = CACHE_PATH) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  return filePath;
}

// ─── 측정 upsert ────────────────────────────────────────────────────

export function upsertMetric(cache, keyword, { monthlySearch = null, cpcKrw = null, provider = 'manual', ttlMs = DEFAULT_TTL_MS, now = new Date() }) {
  const fetchedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const norm = String(keyword || '').trim();
  if (!norm) throw new Error('upsertMetric requires a non-empty keyword.');
  function toPositiveOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }
  const measured = {
    monthlySearch: toPositiveOrNull(monthlySearch),
    cpcKrw: toPositiveOrNull(cpcKrw)
  };
  const hasBoth = measured.monthlySearch !== null && measured.cpcKrw !== null;
  const entry = {
    provider: String(provider || ''),
    method: 'measured',
    fetchedAt,
    expiresAt,
    confidence: hasBoth ? 1 : 0,
    ...measured
  };
  const metrics = cache.metrics || (cache.metrics = {});
  metrics[norm] = entry;
  return entry;
}

// ─── 조회 (provenance-aware) ─────────────────────────────────────────

export function viewMetric(cache, keyword) {
  const norm = String(keyword || '').trim();
  const entry = cache.metrics?.[norm];
  if (!entry) {
    return { keyword: norm, kind: 'unavailable', monthlySearch: null, cpcKrw: null, provider: null, confidence: 0 };
  }
  const nowMs = Date.now();
  const expiresMs = entry.expiresAt ? Date.parse(entry.expiresAt) : nowMs + DEFAULT_TTL_MS;
  if (!Number.isFinite(expiresMs)) {
    return { keyword: norm, kind: 'unavailable', monthlySearch: null, cpcKrw: null, provider: entry.provider, confidence: 0 };
  }
  if (nowMs > expiresMs) {
    return {
      keyword: norm,
      kind: 'stale',
      monthlySearch: entry.monthlySearch,
      cpcKrw: entry.cpcKrw,
      provider: entry.provider,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
      confidence: 0.2
    };
  }
  return {
    keyword: norm,
    kind: 'measured',
    monthlySearch: entry.monthlySearch,
    cpcKrw: entry.cpcKrw,
    provider: entry.provider,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    confidence: entry.confidence ?? 1
  };
}

// ─── 실측 선정 반영 헬퍼 (Phase 5) ─────────────────────────────────────
/**
 * keywords: keywords.json keyword 객체 배열.
 * cache hit 시 kw.metrics.monthlySearch/cpcKrw 를 measured 값으로 교체하고
 * scoreIntent/bid/volume 재계산 없이 selectionScore 경로에서 measured bid/volume을
 * 직접 반영하기 위한 보너스(_measured.bonus)를 첨부한다.
 * - 실패/미측정은 0으로 치환하지 않는다 (kind !== 'measured' → 원본 유지).
 * - 원본 kw.score 는 건드리지 않는다.
 */
export function applyMeasuredMetricsToCandidates(keywords, cache) {
  if (!Array.isArray(keywords)) return [];
  if (!cache || typeof cache !== 'object') return keywords;
  return keywords.map((kw) => {
    if (!kw || typeof kw.keyword !== 'string' || !kw.keyword.trim()) return kw;
    const view = viewMetric(cache, kw.keyword);
    if (view.kind !== 'measured') return kw;
    const monthlySearch = view.monthlySearch;
    const cpcKrw = view.cpcKrw;
    const bid = scoreBid(cpcKrw);
    const vol = scoreVolume(monthlySearch);
    const bonus = measuredSelectionBonus(cpcKrw, monthlySearch);
    const nextMetrics = {
      ...(kw.metrics || {}),
      monthlySearch: view.monthlySearch != null && Number.isFinite(Number(view.monthlySearch)) ? Number(view.monthlySearch) : kw.metrics?.monthlySearch ?? null,
      cpcKrw: view.cpcKrw != null && Number.isFinite(Number(view.cpcKrw)) ? Number(view.cpcKrw) : kw.metrics?.cpcKrw ?? null,
      source: view.provider || kw.metrics?.source || 'measured',
      checkedAt: view.fetchedAt || kw.metrics?.checkedAt || null,
      method: 'measured',
      provenance: {
        provider: view.provider,
        fetchedAt: view.fetchedAt,
        expiresAt: view.expiresAt,
        confidence: view.confidence ?? 1
      }
    };
    return {
      ...kw,
      metrics: nextMetrics,
      _measured: {
        kind: 'measured',
        bid,
        volume: vol,
        bonus,
        cpcKrw,
        monthlySearch,
        provider: view.provider,
        fetchedAt: view.fetchedAt,
        expiresAt: view.expiresAt
      }
    };
  });
}

// ─── Shadow 비교 리포트 ────────────────────────────────────────────


/**
 * candidates: keywords.json 의 keyword 객체 배열.
 * measured 속성(bid/volume/gap)을 provenance 뷰로 치환해
 * selectionScore 변화를 계산한다.
 */
export function buildShadowReport(candidates, cache, { now = new Date() } = {}) {
  const rows = [];
  for (const kw of candidates) {
    const current = {
      intent: kw.score?.intent ?? 0,
      bid: kw.score?.bid ?? 0,
      volume: kw.score?.volume ?? 0,
      gap: kw.score?.gap ?? 0,
      qa: kw.score?.qa ?? 0,
      freshness: freshnessFactor(kw.metrics?.checkedAt || kw.researchedAt, now, 14)
    };
    const view = viewMetric(cache, kw.keyword);

    // 현재 selectionScore — bound: freshness는 로컬에서 계산, 갭은 normalizeGapScore
    const currentGap = normalizeGapScore(kw.gap || {});
    const currentSelection = computeSelectionScore({
      commercialIntentScore: current.intent,
      qaScore: current.qa || 60,
      serpGapScore: currentGap,
      freshness: current.freshness
    });

    // measured 반영 후 — bid/volume 을 실측 구간 점수로, selectionScore에는 보너스 직접 반영
    const measuredBid = view.kind === 'measured' ? scoreBid(view.cpcKrw) : 0;
    const measuredVolume = view.kind === 'measured' ? scoreVolume(view.monthlySearch) : 0;
    const measuredBonus = view.kind === 'measured' ? measuredSelectionBonus(view.cpcKrw, view.monthlySearch) : 0;
    const measuredSelection = computeSelectionScore({
      commercialIntentScore: current.intent,
      qaScore: current.qa || 60,
      serpGapScore: currentGap,
      freshness: current.freshness,
      measuredBonus
    });
    // '돈 점수' 관점의 측정 영향은 별도 시그널로 리포트한다.
    rows.push({
      id: kw.id,
      keyword: kw.keyword,
      category: kw.category,
      metricView: view,
      currentSignal: { bid: current.bid, volume: current.volume, gap: currentGap },
      measuredSignal: { bid: measuredBid, volume: measuredVolume },
      selectionScore: currentSelection,
      measuredProjection: measuredSelection,
      delta: measuredSelection - currentSelection,
      measurementImpact: (measuredBid - current.bid) + (measuredVolume - current.volume)
    });
  }
  rows.sort((a, b) => b.selectionScore - a.selectionScore);
  const measuredCount = rows.filter((r) => r.metricView.kind === 'measured').length;
  const staleCount = rows.filter((r) => r.metricView.kind === 'stale').length;
  const unavailableCount = rows.filter((r) => r.metricView.kind === 'unavailable').length;
  return {
    generatedAt: now.toISOString(),
    candidateCount: rows.length,
    measuredCount,
    staleCount,
    unavailableCount,
    rows
  };
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('metrics-injector.mjs')) {
  (async () => {
    const cache = await readCache();
    const keywordsRaw = await fs.readFile(path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json'), 'utf8');
    const data = JSON.parse(keywordsRaw);
    const report = buildShadowReport(data.keywords || [], cache);
    const outPath = path.join(PROJECT_ROOT, 'content', 'learning', `shadow-metrics-${new Date().toISOString().slice(0, 10)}.json`);
    await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[metrics-injector] Shadow 리포트: ${outPath}`);
    console.log(`  후보 ${report.candidateCount} | measured ${report.measuredCount} | stale ${report.staleCount} | unavailable ${report.unavailableCount}`);
    console.log(`  상위 5 (서버 경로 미반영 현 selectionScore):`);
    for (const r of report.rows.slice(0, 5)) {
      console.log(`   - ${r.keyword} score=${r.selectionScore} view=${r.metricView.kind}`);
    }
  })().catch((error) => {
    console.error(`[metrics-injector] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}