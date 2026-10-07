#!/usr/bin/env node
/**
 * sources/google-news-rss.mjs — Google News RSS adapter (키 불필요)
 *
 * 영문 기술 뉴스 커버용. Naver News가 한국어 위주라 WebRTC/IPFS 같은
 * 영문 이슈는 Google News RSS로 보강한다.
 * item.raw = 기사 제목, item.url = 기사 링크, metrics.pubDate = 발행일.
 */
import { validateSourceResult, validateSourceItem } from './contract.mjs';

const RSS_BASE = 'https://news.google.com/rss/search';
const MAX_QUERY_LEN = 100;

function decodeEntities(text = '') {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function parseRssItems(xml = '') {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      if (!t) return '';
      return decodeEntities(t[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
    };
    items.push({
      title: pick('title'),
      link: pick('link'),
      pubDate: pick('pubDate'),
      source: pick('source'),
      description: pick('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    });
  }
  return items;
}

/**
 * Google News RSS로 뉴스를 조회한다.
 * @param {string} hl 언어 (기본 en-US; 'ko'로 한국어)
 */
export async function fetchGoogleNews({
  query = '',
  hl = 'en-US',
  gl = 'US',
  ceid = 'US:en',
  display = 30,
  fetchImpl = fetch
} = {}) {
  const q = String(query || '').trim().slice(0, MAX_QUERY_LEN);
  if (!q) {
    return validateSourceResult({ source: 'google-news', status: 'unavailable', items: [], error: 'query가 비어 있다' });
  }
  const url = new URL(RSS_BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('hl', hl);
  url.searchParams.set('gl', gl);
  url.searchParams.set('ceid', ceid);
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; tistory-pilot/1.0)' }
    });
    if (!response.ok) {
      return validateSourceResult({ source: 'google-news', status: 'error', items: [], error: `Google News RSS HTTP ${response.status}` });
    }
    const xml = await response.text();
    const rows = parseRssItems(xml).slice(0, display);
    const items = [];
    for (const row of rows) {
      if (!row.title) continue;
      items.push(validateSourceItem({
        raw: row.title,
        normalized: row.title,
        url: row.link || null,
        volumeKind: 'unknown',
        metrics: {
          provider: 'google-news',
          checkedAt: row.pubDate || null,
          volumeKind: 'unknown',
          description: row.description || '',
          pubDate: row.pubDate || null,
          outlet: row.source || null
        }
      }));
    }
    return validateSourceResult({
      source: 'google-news',
      status: items.length ? 'ok' : 'partial',
      items,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return validateSourceResult({
      source: 'google-news',
      status: 'error',
      items: [],
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
