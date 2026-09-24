#!/usr/bin/env node
/**
 * market-discovery.mjs — multi-source market demand discovery.
 *
 * Google Trends/KMA/Naver DataLab provide trend signals. The workflow keeps
 * relative/range signals separate, researches the SERP gap, applies the
 * existing YMYL/focus gates, and writes a dated report. keywords.json is
 * changed only with --apply.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadProjectEnv } from '../lib/load-env.mjs';
import { buildDuplicateGate, isAlreadyPublished, normalizeTitle } from '../lib/published-posts.mjs';
import { researchKeywordMarket } from './market-research.mjs';
import {
  buildCandidates,
  cleanTrendCore,
  inferContentType,
  mapCategory
} from './trends-monetize.mjs';
import {
  DEFAULT_FOCUS_CATEGORIES,
  detectYmylRisk,
  normalizeGapScore,
  scoreCommercialIntent,
  scoreKeyword
} from './keyword-score.mjs';
import { runAdapters } from './sources/aggregator.mjs';

loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');
const LEARNING_DIR = path.join(PROJECT_ROOT, 'content', 'learning');

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function cleanCandidate(value) {
  return String(value || '')
    .replace(/^기상\s*:\s*/i, '')
    .replace(/["'「」『』“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateKey(value) {
  return normalizeTitle(cleanCandidate(value));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function evidenceFor(result, item) {
  return {
    source: result.source,
    raw: item.raw,
    volume: item.volume,
    volumeKind: item.volumeKind,
    rank: item.rank,
    trigger: item.trigger === true,
    url: item.url || null,
    ...(item.metrics ? { metrics: item.metrics } : {})
  };
}

/**
 * Convert source items into commercial candidate phrases. The source item is
 * kept as evidence even when a commercial suffix is appended, so the report
 * can explain why a keyword was selected.
 */
export function collectMarketCandidates(results = [], { maxSeeds = 60 } = {}) {
  const byKeyword = new Map();
  const add = (keyword, evidence) => {
    const cleaned = cleanCandidate(keyword);
    const key = candidateKey(cleaned);
    if (!key || cleaned.length < 2 || cleaned.length > 40) return;
    if (!byKeyword.has(key)) byKeyword.set(key, { keyword: cleaned, evidence: [] });
    const row = byKeyword.get(key);
    const evidenceKey = `${evidence.source}:${evidence.raw}:${evidence.rank ?? ''}`;
    if (!row.evidence.some((entry) => `${entry.source}:${entry.raw}:${entry.rank ?? ''}` === evidenceKey)) row.evidence.push(evidence);
  };

  let seedCount = 0;
  for (const result of results) {
    if (!Array.isArray(result?.items)) continue;
    for (const item of result.items) {
      if (seedCount >= maxSeeds) break;
      const raw = cleanCandidate(item.normalized || item.raw);
      if (!raw) continue;
      const evidence = evidenceFor(result, item);
      const core = cleanTrendCore(raw) || raw;
      const category = mapCategory(core);
      const directIntent = scoreCommercialIntent(core).score;
      if (directIntent >= 8) add(core, evidence);
      for (const candidate of buildCandidates(core, category)) add(candidate, evidence);
      seedCount += 1;
    }
    if (seedCount >= maxSeeds) break;
  }

  return [...byKeyword.values()];
}

function finiteMetric(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function absoluteMetrics(candidate) {
  const measured = candidate.evidence
    .map((entry) => entry.metrics)
    .filter((metrics) => metrics?.provider && metrics.checkedAt && metrics.volumeKind === 'absolute');
  if (!measured.length) return { monthlySearch: 0, cpcKrw: 0, source: 'estimate', checkedAt: '', volumeKind: 'unknown' };
  const best = [...measured].sort((a, b) => Number(b.monthlySearch || 0) - Number(a.monthlySearch || 0))[0];
  return {
    monthlySearch: finiteMetric(best.monthlySearch),
    cpcKrw: finiteMetric(best.cpcKrw),
    source: String(best.provider),
    checkedAt: String(best.checkedAt),
    volumeKind: 'absolute'
  };
}

export function popularityScore(candidate = {}) {
  const evidence = Array.isArray(candidate.evidence) ? candidate.evidence : [];
  const sources = new Set(evidence.map((entry) => entry.source).filter(Boolean));
  let score = 0;
  for (const entry of evidence) {
    const volume = Number(entry.volume);
    if (entry.volumeKind === 'absolute' && Number.isFinite(volume) && volume > 0) {
      score = Math.max(score, Math.min(72, 10 + Math.round(Math.log10(volume) * 10)));
    } else if (entry.volumeKind === 'range' && Number.isFinite(volume) && volume > 0) {
      score = Math.max(score, Math.min(58, 10 + Math.round(Math.log10(volume) * 7)));
    } else if (entry.volumeKind === 'relative' && Number.isFinite(volume) && volume > 0) {
      score = Math.max(score, Math.min(42, Math.round(volume)));
    }
    if (Number.isInteger(entry.rank) && entry.rank > 0) score = Math.max(score, Math.max(4, 34 - (entry.rank * 2)));
    if (entry.trigger) score = Math.max(score, 36);
  }
  if (sources.size >= 2) score += 12;
  return Math.min(100, score);
}

export function demandConfidence(candidate = {}) {
  const evidence = Array.isArray(candidate.evidence) ? candidate.evidence : [];
  if (evidence.some((entry) => entry.metrics?.provider && entry.metrics?.volumeKind === 'absolute')) return 'measured';
  if (evidence.some((entry) => entry.volumeKind === 'range' || entry.volumeKind === 'relative' || entry.trigger)) return 'trend-signal';
  return 'unavailable';
}

export function scoreMarketCandidate(candidate, market, {
  focusCategories = DEFAULT_FOCUS_CATEGORIES,
  allowLegacySeries = false
} = {}) {
  const category = mapCategory(candidate.keyword);
  const contentType = inferContentType(candidate.keyword);
  const metrics = absoluteMetrics(candidate);
  const scored = scoreKeyword({
    keyword: candidate.keyword,
    category,
    contentType,
    metrics,
    gap: market?.serpGap || {}
  }, { focusCategories, allowLegacySeries });
  const popularity = popularityScore(candidate);
  const gap = normalizeGapScore(market?.serpGap || {});
  const measurement = Math.round((scored.score.bid / 20) * 3 + (scored.score.volume / 15) * 2);
  const marketScore = Math.min(100, Math.round(
    (scored.score.intent / 25) * 30
      + (popularity / 100) * 25
      + (gap / 20) * 20
      + (scored.score.source / 10) * 10
      + (scored.score.durability / 10) * 10
      + measurement
  ));
  return {
    ...candidate,
    category,
    contentType,
    metrics,
    confidence: demandConfidence(candidate),
    popularityScore: popularity,
    serpGapScore: gap,
    marketScore,
    score: scored.score,
    intent: scored.intent,
    gates: scored.gates,
    ymylRisk: detectYmylRisk(candidate.keyword, category),
    market: market || null
  };
}

function candidateDuplicate(existingKeywords, candidate) {
  const key = candidateKey(candidate);
  if (!key) return false;
  return existingKeywords.some((item) => {
    const existing = candidateKey(item.keyword);
    if (!existing) return false;
    return existing === key || existing.includes(key) || key.includes(existing);
  });
}

function sourceStatusSummary(results) {
  return results.map((result) => ({
    source: result.source,
    status: result.status,
    fetchedAt: result.fetchedAt,
    expiresAt: result.expiresAt,
    itemCount: result.items?.length || 0,
    error: result.error || null
  }));
}

function measuredDescription(row) {
  const sources = uniqueStrings(row.evidence.map((entry) => entry.source));
  const signal = row.confidence === 'measured'
    ? `실측 검색 데이터(${row.metrics.monthlySearch || 0}회)`
    : `추세 신호(${row.popularityScore}/100)`;
  return `시장 발굴 — ${signal}; 출처 ${sources.join(', ') || '없음'}`;
}

function buildKeywordRecord(row, date, sequence, now) {
  const dateCompact = date.replace(/-/g, '');
  const gap = row.market?.serpGap || {};
  return {
    id: `market-${dateCompact}-${sequence}`,
    keyword: row.keyword,
    category: row.category,
    contentType: row.contentType,
    tags: uniqueStrings([row.keyword.split(/\s+/)[0], row.contentType === 'cost' ? '비용' : row.contentType === 'process' ? '신청' : '문제해결']),
    description: measuredDescription(row),
    metrics: row.metrics,
    score: row.score,
    gap: { ...gap, total: Number(gap.total || 0), rawTotal: Number(gap.rawTotal || gap.total || 0) },
    ymylRisk: row.ymylRisk.risk,
    commercialIntent: row.intent.score,
    cpcTier: row.metrics.cpcKrw > 0 ? (row.score.bid >= 17 ? 'S' : row.score.bid >= 9 ? 'A' : 'B') : 'U',
    enabled: true,
    ymylDomain: row.ymylRisk.domain,
    researchedAt: now,
    source: 'market-discovery',
    marketDiscovery: {
      researchedAt: now,
      confidence: row.confidence,
      marketScore: row.marketScore,
      popularityScore: row.popularityScore,
      sourceCount: new Set(row.evidence.map((entry) => entry.source)).size,
      evidence: row.evidence,
      market: row.market
    }
  };
}

export async function discoverMarketKeywords({
  date = todayDate(),
  cap = 5,
  maxCandidates = 36,
  maxSeeds = 60,
  env = process.env,
  skip = [],
  adapterResults = null,
  runAdaptersFn = runAdapters,
  researchFn = researchKeywordMarket,
  keywordsData = null,
  keywordsPath = KEYWORDS_PATH,
  duplicateGate = null,
  buildGateFn = buildDuplicateGate,
  apply = false,
  writeReport = true,
  reportPath = path.join(LEARNING_DIR, `market-discovery-${date}.json`),
  now = new Date()
} = {}) {
  const startedAt = new Date(now).toISOString();
  const data = keywordsData || JSON.parse(await fs.readFile(keywordsPath, 'utf8'));
  const existingKeywords = Array.isArray(data.keywords) ? data.keywords : [];
  const results = adapterResults || await runAdaptersFn({ env, skip });
  const sourceStatus = sourceStatusSummary(results);
  const rawCandidates = collectMarketCandidates(results, { maxSeeds });
  const gate = duplicateGate || await buildGateFn({
    blogUrl: 'https://acstory.tistory.com',
    ledgerPath: path.join(PROJECT_ROOT, 'content', 'published.json'),
    log: () => {}
  });
  const researched = [];
  const rejected = [];

  for (const raw of rawCandidates.slice(0, maxCandidates)) {
    if (candidateDuplicate(existingKeywords, raw.keyword)) {
      rejected.push({ keyword: raw.keyword, reason: 'existing-keyword' });
      continue;
    }
    const duplicate = isAlreadyPublished({ id: '', keyword: raw.keyword, title: raw.keyword }, gate);
    if (duplicate.matched) {
      rejected.push({ keyword: raw.keyword, reason: `published:${duplicate.rule}` });
      continue;
    }
    let market = null;
    try {
      market = await researchFn(raw.keyword, { category: mapCategory(raw.keyword) });
    } catch (error) {
      rejected.push({ keyword: raw.keyword, reason: `market-research-error:${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    const row = scoreMarketCandidate(raw, market, {
      focusCategories: data.focusCategories || DEFAULT_FOCUS_CATEGORIES,
      allowLegacySeries: data.allowLegacySeries
    });
    if (!row.gates.ymyl.allowed) {
      rejected.push({ keyword: raw.keyword, reason: `ymyl:${row.gates.ymyl.reason}` });
      continue;
    }
    if (!row.gates.focus.allowed) {
      rejected.push({ keyword: raw.keyword, reason: `focus:${row.gates.focus.reason}` });
      continue;
    }
    const threshold = row.confidence === 'measured' ? 6 : 8;
    if (row.intent.score < threshold || (row.intent.intent === 'informational' && row.popularityScore < 45)) {
      rejected.push({ keyword: raw.keyword, reason: `commercial-intent:${row.intent.score}/25` });
      continue;
    }
    researched.push(row);
  }

  const selected = researched
    .sort((a, b) => b.marketScore - a.marketScore || b.popularityScore - a.popularityScore || b.intent.score - a.intent.score)
    .slice(0, Math.max(0, Number(cap) || 0));
  const report = {
    version: 1,
    date,
    startedAt,
    completedAt: new Date().toISOString(),
    status: selected.length ? 'ok' : (rawCandidates.length ? 'no-eligible-candidates' : 'no-source-candidates'),
    applied: Boolean(apply),
    providerStatus: sourceStatus,
    rawCandidateCount: rawCandidates.length,
    researchedCandidateCount: researched.length,
    rejectedCount: rejected.length,
    selected: selected.map((row) => ({
      keyword: row.keyword,
      category: row.category,
      contentType: row.contentType,
      marketScore: row.marketScore,
      popularityScore: row.popularityScore,
      confidence: row.confidence,
      metrics: row.metrics,
      score: row.score,
      serpGapScore: row.serpGapScore,
      sourceCount: new Set(row.evidence.map((entry) => entry.source)).size,
      market: row.market
    })),
    rejected: rejected.slice(0, 100)
  };

  let appended = [];
  if (apply && selected.length) {
    const nowIso = new Date(now).toISOString();
    const usedIds = new Set(existingKeywords.map((item) => item.id));
    let sequence = 1;
    for (const row of selected) {
      let record;
      do {
        record = buildKeywordRecord(row, date, sequence++, nowIso);
      } while (usedIds.has(record.id));
      usedIds.add(record.id);
      existingKeywords.push(record);
      appended.push(record);
    }
    data.keywords = existingKeywords;
    data.updatedAt = nowIso.slice(0, 10);
    await fs.writeFile(keywordsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(path.join(path.dirname(reportPath), `market-discovery-${date}.selected.txt`), `${appended.map((item) => item.id).join('\n')}\n`, 'utf8');
  }
  if (writeReport) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return { report, selected, appended, outPath: reportPath };
}

function parseArgs(argv) {
  const args = { date: '', cap: 5, maxCandidates: 36, apply: false, json: false, skip: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date' && argv[i + 1]) args.date = argv[++i];
    else if (arg === '--cap' && argv[i + 1]) args.cap = Number(argv[++i]) || 5;
    else if (arg === '--max-candidates' && argv[i + 1]) args.maxCandidates = Number(argv[++i]) || 36;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--skip' && argv[i + 1]) args.skip = argv[++i].split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help') {
      console.log('사용법: node scripts/content/market-discovery.mjs [--date YYYY-MM-DD] [--cap N] [--max-candidates N] [--apply] [--skip source,...] [--json]');
      process.exit(0);
    }
  }
  if (!args.date) args.date = todayDate();
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await discoverMarketKeywords({ date: args.date, cap: args.cap, maxCandidates: args.maxCandidates, skip: args.skip, apply: args.apply });
  if (args.json) {
    console.log(JSON.stringify(result.report, null, 2));
    return;
  }
  console.log(`[market-discovery] 공급자 ${result.report.providerStatus.map((row) => `${row.source}=${row.status}`).join(', ')}`);
  console.log(`[market-discovery] 원천 후보 ${result.report.rawCandidateCount}건 → 조사 ${result.report.researchedCandidateCount}건 → 선정 ${result.selected.length}건`);
  for (const row of result.selected) {
    console.log(`  ✓ ${row.keyword} [${row.category}/${row.contentType}] 시장점수=${row.marketScore} 인기=${row.popularityScore} 신뢰=${row.confidence}`);
  }
  console.log(`[market-discovery] 리포트: ${result.outPath}`);
  console.log(args.apply ? `[market-discovery] keywords.json 등록: ${result.appended.length}건` : '[market-discovery] dry-run — keywords.json 변경 없음');
}

const isCli = process.argv[1] && process.argv[1].endsWith('market-discovery.mjs');
if (isCli) {
  main().catch((error) => {
    console.error(`[market-discovery] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
