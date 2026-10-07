#!/usr/bin/env node
/**
 * sources/naver-news.mjs — NAVER API HUB 뉴스 검색 adapter
 *
 * API Hub 키(NAVER_DATALAB_CLIENT_ID/SECRET과 동일 키)로
 * /search/v1/news 를 조회한다. 기사 단위 item을 반환하며
 * volume은 없다 — 뉴스 소스는 검색량이 아니라 기사 자체가 산출물이다.
 *
 * item.raw = 기사 제목, item.url = 원문 링크, item.metrics.pubDate = 발행일.
 * description은 metrics.description에 보존한다 (기사 요약).
 */
import { validateSourceResult, validateSourceItem } from './contract.mjs';

const NEWS_API = 'https://naverapihub.apigw.ntruss.com/search/v1/news';
const MAX_QUERY_LEN = 100;

function stripTags(text = '') {
  return String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function readConfig(env = process.env) {
  return {
    clientId: env.NAVER_DATALAB_CLIENT_ID || env.NAVER_APIHUB_CLIENT_ID || '',
    clientSecret: env.NAVER_DATALAB_CLIENT_SECRET || env.NAVER_APIHUB_CLIENT_SECRET || ''
  };
}

/**
 * 단일 쿼리로 뉴스를 조회한다.
 * @returns {Promise<{source:string,status:string,items:Array,error?:string}>}
 */
export async function fetchNaverNews({
  env = process.env,
  query = '',
  display = 50,
  sort = 'date',
  fetchImpl = fetch
} = {}) {
  const cfg = readConfig(env);
  if (!cfg.clientId || !cfg.clientSecret) {
    return validateSourceResult({
      source: 'naver-news',
      status: 'unavailable',
      items: [],
      error: 'NAVER_DATALAB_CLIENT_ID/SECRET 미등록 — API Hub 뉴스 조회 불가'
    });
  }
  const q = String(query || '').trim().slice(0, MAX_QUERY_LEN);
  if (!q) {
    return validateSourceResult({ source: 'naver-news', status: 'unavailable', items: [], error: 'query가 비어 있다' });
  }
  const url = new URL(NEWS_API);
  url.searchParams.set('query', q);
  url.searchParams.set('display', String(Math.min(100, Math.max(1, display))));
  url.searchParams.set('sort', sort === 'date' ? 'date' : 'sim');
  try {
    const response = await fetchImpl(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': cfg.clientId,
        'X-NCP-APIGW-API-KEY': cfg.clientSecret
      }
    });
    if (response.status === 401 || response.status === 403) {
      return validateSourceResult({
        source: 'naver-news',
        status: 'unavailable',
        items: [],
        error: `Naver API Hub 인증 실패 (HTTP ${response.status})`
      });
    }
    if (response.status === 429) {
      return validateSourceResult({ source: 'naver-news', status: 'rate_limited', items: [], error: 'Naver API rate limit' });
    }
    if (!response.ok) {
      return validateSourceResult({ source: 'naver-news', status: 'error', items: [], error: `Naver News API HTTP ${response.status}` });
    }
    const body = await response.json();
    const rows = Array.isArray(body.items) ? body.items : [];
    const items = [];
    for (const row of rows) {
      const title = stripTags(row.title);
      if (!title) continue;
      items.push(validateSourceItem({
        raw: title,
        normalized: title,
        url: row.originallink || row.link || null,
        volumeKind: 'unknown',
        metrics: {
          provider: 'naver-news',
          checkedAt: row.pubDate || null,
          volumeKind: 'unknown',
          description: stripTags(row.description),
          pubDate: row.pubDate || null,
          naverLink: row.link || null
        }
      }));
    }
    return validateSourceResult({
      source: 'naver-news',
      status: items.length ? 'ok' : 'partial',
      items,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return validateSourceResult({
      source: 'naver-news',
      status: 'error',
      items: [],
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
