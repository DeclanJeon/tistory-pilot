#!/usr/bin/env node
/**
 * sources/naver-search-ads.mjs — Naver Search Ads keyword tool adapter.
 *
 * Search volume and average click-cost values are returned only when the
 * advertiser API credentials exist. Missing credentials stay unavailable;
 * they are never represented as zero-volume measurements.
 */
import crypto from 'node:crypto';
import { validateSourceResult } from './contract.mjs';
import { normalizeTitle } from '../../lib/published-posts.mjs';

const DEFAULT_BASE_URL = 'https://api.searchad.naver.com';
const KEYWORD_TOOL_PATH = '/keywordstool';

function asNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text || /^[-<]/.test(text)) return null;
  const number = Number(text.replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function readKeywords(env = process.env, explicit = null) {
  const input = explicit == null
    ? (env.NAVER_SEARCHADS_KEYWORDS || env.MARKET_SEED_KEYWORDS || env.NAVER_DATALAB_KEYWORDS || '')
    : explicit;
  return (Array.isArray(input) ? input : String(input || '').split(','))
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function buildNaverSearchAdsSignature(timestamp, method, uri, secretKey) {
  return crypto
    .createHmac('sha256', String(secretKey))
    .update(`${timestamp}.${String(method).toUpperCase()}.${uri}`)
    .digest('base64');
}

export function readNaverSearchAdsConfig(env = process.env, keywords = null) {
  return {
    apiKey: String(env.NAVER_SEARCHADS_API_KEY || env.NAVER_SEARCHADS_ACCESS_LICENSE || '').trim(),
    secretKey: String(env.NAVER_SEARCHADS_SECRET || env.NAVER_SEARCHADS_SECRET_KEY || '').trim(),
    customerId: String(env.NAVER_SEARCHADS_CUSTOMER_ID || '').trim(),
    baseUrl: String(env.NAVER_SEARCHADS_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, ''),
    keywords: readKeywords(env, keywords)
  };
}

function parseKeywordRow(row, checkedAt) {
  const pc = asNumber(row.monthlyPcQcCnt);
  const mobile = asNumber(row.monthlyMobileQcCnt);
  const monthlySearch = pc == null && mobile == null ? null : (pc || 0) + (mobile || 0);
  const pcCost = asNumber(row.monthlyAvePcCost ?? row.monthlyAvePcBid);
  const mobileCost = asNumber(row.monthlyAveMobileCost ?? row.monthlyAveMobileBid);
  const costs = [pcCost, mobileCost].filter((value) => value != null && value > 0);
  const cpcKrw = costs.length ? Math.round(costs.reduce((sum, value) => sum + value, 0) / costs.length) : null;
  const raw = String(row.relKeyword || row.keyword || '').replace(/\s+/g, ' ').trim();
  return {
    raw,
    normalized: normalizeTitle(raw),
    rank: null,
    volume: monthlySearch,
    volumeKind: 'absolute',
    url: 'https://searchad.naver.com/keywordstool',
    metrics: {
      monthlySearch,
      cpcKrw,
      competition: row.compIdx == null ? null : String(row.compIdx),
      provider: 'naver-search-ads',
      checkedAt,
      volumeKind: 'absolute'
    }
  };
}

export async function fetchNaverSearchAds({
  env = process.env,
  keywords = null,
  fetchImpl = globalThis.fetch,
  ttlSeconds = 12 * 60 * 60,
  now = Date.now()
} = {}) {
  const config = readNaverSearchAdsConfig(env, keywords);
  if (!config.apiKey || !config.secretKey || !config.customerId) {
    return validateSourceResult({
      source: 'naver-search-ads',
      status: 'unavailable',
      items: [],
      error: 'NAVER_SEARCHADS_API_KEY/SECRET/CUSTOMER_ID 미등록 — 검색광고 실측 조회 불가'
    });
  }
  if (config.keywords.length === 0) {
    return validateSourceResult({
      source: 'naver-search-ads',
      status: 'unavailable',
      items: [],
      error: '동적 시장 관심사 또는 NAVER_SEARCHADS_KEYWORDS/MARKET_SEED_KEYWORDS 가 비어 있다'
    });
  }
  if (typeof fetchImpl !== 'function') {
    return validateSourceResult({ source: 'naver-search-ads', status: 'error', items: [], error: 'fetch 구현을 찾을 수 없다' });
  }

  const rawNow = typeof now === 'function' ? now() : now;
  const parsedNow = rawNow instanceof Date ? rawNow.getTime() : Number(rawNow);
  const timestampMs = Number.isFinite(parsedNow) ? parsedNow : Date.parse(String(rawNow));
  const timestamp = String(Number.isFinite(timestampMs) ? Math.trunc(timestampMs) : Date.now());
  const url = new URL(`${config.baseUrl}${KEYWORD_TOOL_PATH}`);
  url.searchParams.set('hintKeywords', config.keywords.join(','));
  url.searchParams.set('showDetail', '1');
  const checkedAt = new Date(Number(timestamp)).toISOString();
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': config.apiKey,
        'X-Customer': config.customerId,
        'X-Signature': buildNaverSearchAdsSignature(timestamp, 'GET', KEYWORD_TOOL_PATH, config.secretKey),
        'user-agent': 'tistory-pilot/market-discovery'
      }
    });
    if (response.status === 401 || response.status === 403) {
      return validateSourceResult({ source: 'naver-search-ads', status: 'unavailable', items: [], error: `Naver Search Ads 인증 실패 (HTTP ${response.status})` });
    }
    if (response.status === 429) {
      return validateSourceResult({ source: 'naver-search-ads', status: 'rate_limited', items: [], error: 'Naver Search Ads rate limit' });
    }
    if (!response.ok) {
      return validateSourceResult({ source: 'naver-search-ads', status: 'error', items: [], error: `Naver Search Ads HTTP ${response.status}` });
    }
    const body = await response.json();
    const rows = Array.isArray(body.keywordList) ? body.keywordList : [];
    const items = rows.map((row) => parseKeywordRow(row, checkedAt)).filter((item) => item.raw);
    return validateSourceResult({
      source: 'naver-search-ads',
      status: items.length ? 'ok' : 'partial',
      fetchedAt: checkedAt,
      ttlSeconds,
      items,
      error: items.length ? null : 'keywordList가 비어 있다'
    });
  } catch (error) {
    return validateSourceResult({ source: 'naver-search-ads', status: 'error', items: [], error: error instanceof Error ? error.message : String(error) });
  }
}
