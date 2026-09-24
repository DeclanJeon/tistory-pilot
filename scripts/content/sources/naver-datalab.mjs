#!/usr/bin/env node
/**
 * sources/naver-datalab.mjs — Naver DataLab 검색어 트렌드 adapter (설계 §3.1)
 *
 * Naver DataLab(데이터랩)은 검색 추세 신호(기준일=100 지수)다.
 * CPC/광고 단가를 제공하지 않으므로 volume을 'relative'로만 표기하고
 * 광고 가치 추정에 쓰지 않는다.
 *
 * 키 게이트: NAVER_DATALAB_CLIENT_ID / NAVER_DATALAB_CLIENT_SECRET 이
 * 등록되지 않으면 unavailable로 반환한다 (0건으로 치환하지 않음).
 *
 * 참고: 오픈API는 그룹 비율 조회(일/주/월 단위, 최대 30일)이며
 * '급상승 검색어' 실시간 탑인은 별도 상품(검색광고 API)이다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateSourceResult } from './contract.mjs';
import { normalizeTitle } from '../../lib/published-posts.mjs';

const DATALAB_API = 'https://openapi.naver.com/v1/datalab/search';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const DEFAULT_USAGE_FILE = path.join(PROJECT_ROOT, 'content', 'learning', 'naver-datalab-usage.json');
export const NAVER_DATALAB_HARD_MONTHLY_LIMIT = 50_000;
const USAGE_LOCK_TIMEOUT_MS = 5_000;
const USAGE_LOCK_STALE_MS = 2 * 60 * 1000;
const USAGE_LOCK_RETRY_MS = 50;

function parseKeywords(input) {
  return (Array.isArray(input) ? input : String(input || '').split(','))
    .map((s) => String(s || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
}
function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function koreaMonthKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(asDate(value));
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  return `${year}-${month}`;
}

function resolveMonthlyLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NAVER_DATALAB_HARD_MONTHLY_LIMIT;
  return Math.max(0, Math.min(NAVER_DATALAB_HARD_MONTHLY_LIMIT, Math.floor(parsed)));
}

async function acquireUsageLock(lockPath) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  while (true) {
    try {
      await fs.mkdir(lockPath);
      return async () => fs.rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > USAGE_LOCK_STALE_MS) {
          await fs.rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - startedAt >= USAGE_LOCK_TIMEOUT_MS) {
        throw new Error('DataLab 사용량 잠금 획득 시간 초과');
      }
      await new Promise((resolve) => setTimeout(resolve, USAGE_LOCK_RETRY_MS));
    }
  }
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

/**
 * Reserve one request before making the API call. The hard ceiling is fixed
 * at the operator-provided 50,000 monthly quota; configuration may only lower
 * it. A lock prevents market-discovery and shadow-run from overshooting when
 * they happen to run concurrently.
 */
export async function reserveNaverDataLabRequest({
  usageFile = DEFAULT_USAGE_FILE,
  monthlyLimit = NAVER_DATALAB_HARD_MONTHLY_LIMIT,
  now = new Date()
} = {}) {
  const filePath = path.resolve(String(usageFile || DEFAULT_USAGE_FILE));
  const limit = resolveMonthlyLimit(monthlyLimit);
  const month = koreaMonthKey(now);
  const lockPath = `${filePath}.lock`;
  let release = null;
  try {
    release = await acquireUsageLock(lockPath);
    let usage;
    try {
      usage = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        usage = { version: 1, months: {} };
      } else {
        throw new Error(`DataLab 사용량 파일을 읽을 수 없다: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!usage || typeof usage !== 'object' || Array.isArray(usage) || Array.isArray(usage.months) || (usage.months && typeof usage.months !== 'object')) {
      throw new Error('DataLab 사용량 파일 형식이 잘못됐다.');
    }
    usage.version = 1;
    usage.months = usage.months || {};
    const current = usage.months[month] || {};
    const used = Number(current.requests || 0);
    if (!Number.isInteger(used) || used < 0) throw new Error('DataLab 사용량 카운터가 잘못됐다.');
    if (used >= limit) {
      return { ok: false, reason: 'monthly-limit', month, used, limit, usageFile: filePath };
    }
    usage.months[month] = {
      requests: used + 1,
      updatedAt: asDate(now).toISOString()
    };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await writeJsonAtomic(filePath, usage);
    return { ok: true, reason: 'reserved', month, used: used + 1, limit, usageFile: filePath };
  } catch (error) {
    return {
      ok: false,
      reason: 'tracking-failed',
      month,
      limit,
      usageFile: filePath,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (release) await release().catch(() => {});
  }
}


function readConfig(env = process.env, explicitKeywords = null) {
  const input = explicitKeywords == null ? (env.NAVER_DATALAB_KEYWORDS || '') : explicitKeywords;
  return {
    clientId: env.NAVER_DATALAB_CLIENT_ID || '',
    clientSecret: env.NAVER_DATALAB_CLIENT_SECRET || '',
    keywords: parseKeywords(input)
  };
}

/**
 * 동적으로 전달받은 상위 관심사 또는 NAVER_DATALAB_KEYWORDS의 검색어에
 * 대한 7일 상대 검색 추세를 조회한다. 실패/미등록은 unavailable로 반환한다.
 */
export async function fetchNaverDataLab({
  env = process.env,
  keywords = null,
  ttlSeconds = 12 * 60 * 60,
  usageFile = env.NAVER_DATALAB_USAGE_FILE || DEFAULT_USAGE_FILE,
  monthlyLimit = env.NAVER_DATALAB_MONTHLY_LIMIT || NAVER_DATALAB_HARD_MONTHLY_LIMIT,
  now = new Date()
} = {}) {
  const cfg = readConfig(env, keywords);
  if (!cfg.clientId || !cfg.clientSecret) {
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'unavailable',
      items: [],
      error: 'NAVER_DATALAB_CLIENT_ID/SECRET 미등록 — 데이터랩 검색 추세 조회 불가'
    });
  }
  if (cfg.keywords.length === 0) {
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'unavailable',
      items: [],
      error: '동적 시장 관심사 또는 NAVER_DATALAB_KEYWORDS 가 비어 있다'
    });
  }
  const quota = await reserveNaverDataLabRequest({ usageFile, monthlyLimit, now });
  if (!quota.ok) {
    const error = quota.reason === 'monthly-limit'
      ? `Naver DataLab 월간 호출 상한 도달 (${quota.used}/${quota.limit}, ${quota.month})`
      : `Naver DataLab 사용량 추적 실패 — API 호출을 차단한다: ${quota.error || quota.reason}`;
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'rate_limited',
      items: [],
      error
    });
  }
  const requestDate = asDate(now);
  const startDate = new Date(requestDate.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = requestDate.toISOString().slice(0, 10);
  try {
    const response = await fetch(DATALAB_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Naver-Client-Id': cfg.clientId,
        'X-Naver-Client-Secret': cfg.clientSecret
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: 'date',
        keywordGroups: cfg.keywords.map((keyword) => ({ keywords: [keyword], groupName: keyword }))
      })
    });
    if (response.status === 401 || response.status === 403) {
      return validateSourceResult({
        source: 'naver-datalab',
        status: 'unavailable',
        items: [],
        error: `Naver 인증 실패 (HTTP ${response.status})`
      });
    }
    if (response.status === 429) {
      return validateSourceResult({
        source: 'naver-datalab',
        status: 'rate_limited',
        items: [],
        error: 'Naver API rate limit'
      });
    }
    if (!response.ok) {
      return validateSourceResult({
        source: 'naver-datalab',
        status: 'error',
        items: [],
        error: `Naver API HTTP ${response.status}`
      });
    }
    const body = await response.json();
    const items = (body.results || []).map((result, index) => {
      const series = Array.isArray(result.data) ? result.data.filter(Boolean) : [];
      const last = series[series.length - 1];
      const volume = last ? Number(last.ratio ?? null) : null;
      return {
        raw: result.title || cfg.keywords[index] || '',
        normalized: normalizeTitle(result.title || cfg.keywords[index] || ''),
        rank: index + 1,
        volume: Number.isFinite(volume) ? volume : null,
        volumeKind: 'relative',
        url: 'https://datalab.naver.com/keyword/section.naver'
      };
    });
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'ok',
      fetchedAt: new Date().toISOString(),
      ttlSeconds,
      items
    });
  } catch (error) {
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'error',
      items: [],
      error: error instanceof Error ? error.message : String(error)
    });
  }
}