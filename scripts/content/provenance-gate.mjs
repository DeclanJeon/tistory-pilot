#!/usr/bin/env node
/**
 * provenance-gate.mjs — 구조화 출처 검증 게이트 (Phase 2, 설계 §3.6)
 *
 * 기존 qa-post 는 본문 텍스트에 '출처'/'기준일' 문자열이 있는지만 본다.
 * 이 모듈은 LLM 이 붙이는 **구조화 sourceBundle(실제 URL)** 을 검증한다.
 *
 * verdict:
 *  - fail        : YMYL 글이 공식 출처 없음 → 발행 차단 (P0). 표절 검사가 실행 안 됐지만
 *                  통과로 위장하면 안 되므로 별도 'unknown' 노트를 남긴다.
 *  - needs_review: 비-YMYL 글이 출처 없음 → 관측(warning) + PROVENANCE_HARD_GATE=1 이면 차단.
 *  - pass        : 출처 있음(또는 출처가 없는 비-YMYL 과 review 없이 허용됨).
 *
 * 표절 검사는 실행 여부를 'unknown' 으로 남기고, 실행 안 했다고 통과로 간주하지 않는다.
 */
import { detectYmylRisk as _detectYmylRisk } from './keyword-score.mjs';

const PRICE_RE = /[\d,]+(\s*만원|\s*원|\s*달러|\s*$)|\b\d{1,3}(,\d{3})*\s*(원|만원)\b/;
const ASOF_RE = /20\d{2}\s*(년|년도)?\s*(기준|기준으로|개정|시행|발표)|기준일|시행일|as of|as-of/i;

const OFFICIAL_DOMAIN_ALLOWLIST = [
  'gov.kr',
  'go.kr',
  'korea.kr',
  'fss.or.kr',
  'fss.go.kr',
  'fsc.go.kr',
  'bok.or.kr',
  'nts.go.kr',
  'hometax.go.kr',
  'nhis.or.kr',
  'hira.or.kr',
  'kostat.go.kr',
  'data.go.kr',
  'moel.go.kr',
  'mohw.go.kr',
  'law.go.kr',
  'kidol.go.kr',
  'g2b.go.kr'
];

export function isOfficialSourceUrl(url) {
  try {
    const u = new URL(String(url).trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return OFFICIAL_DOMAIN_ALLOWLIST.some((suffix) => host === suffix || host.endsWith('.' + suffix));
  } catch {
    return false;
  }
}


/**
 * sourceBundle 형태:
 *   [{ url, title?, publisher?, claims?[] }]   또는
 *   { url: '...' } 또는 { sources: [...] } 또는 { urls: [...] }
 * null/[]/객체지만 URL 하나도 없으면 false.
 */
export function extractSourceUrls(sourceBundle) {
  if (Array.isArray(sourceBundle)) {
    return sourceBundle
      .map((s) => (s && (s.url || s.link)) || '')
      .filter((u) => /^https?:\/\//i.test(String(u).trim()));
  }
  if (sourceBundle && typeof sourceBundle === 'object') {
    const list = sourceBundle.urls || sourceBundle.sources || sourceBundle.links || [];
    if (Array.isArray(list)) {
      return list
        .map((s) => (typeof s === 'string' ? s : (s && (s.url || s.link)) || ''))
        .filter((u) => /^https?:\/\//i.test(String(u).trim()));
    }
    const single = sourceBundle.url || sourceBundle.link || '';
    if (/^https?:\/\//i.test(String(single).trim())) return [String(single).trim()];
  }
  return [];
}

export function hasSourceUrls(sourceBundle) {
  return extractSourceUrls(sourceBundle).length > 0;
}
export function hasOfficialSourceUrls(sourceBundle) {
  return extractSourceUrls(sourceBundle).some(isOfficialSourceUrl);
}
export function stripHtml(text = '') {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── sourceBundle 생성기: researchKeyword 결과(context.market) → [{url,title,publisher}] ──
function publisherFromUrl(url, fallback = '') {
  const fb = String(fallback || '').trim();
  if (fb) return fb;
  try {
    const u = new URL(String(url).trim());
    return u.hostname.replace(/^www\./i, '') || fb;
  } catch {
    return fb;
  }
}

/**
 * market.competitors 상위 3개(title/url)를 [{url,title,publisher}]로 변환.
 * @param {object|Array} marketOrCompetitors - market 객체(.competitors) 또는 배열
 * @returns {Array<{url:string,title:string,publisher:string}>}
 */
export function buildSourceBundleFromMarket(marketOrCompetitors) {
  const list = Array.isArray(marketOrCompetitors)
    ? marketOrCompetitors
    : (marketOrCompetitors && Array.isArray(marketOrCompetitors.competitors) ? marketOrCompetitors.competitors : []);
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  for (const c of list) {
    if (out.length >= 3) break;
    if (!c || typeof c !== 'object') continue;
    const url = String(c.url || c.link || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const title = String(c.title || c.name || '').trim();
    if (!title) continue;
    const publisher = (() => {
      if (typeof c.publisher === 'string' && c.publisher.trim()) return c.publisher.trim();
      // source가 publisher처럼 쓰인 경우도 허용하되, URL host가 더 신뢰 가능하면 host를 쓴다
      const host = publisherFromUrl(url, '');
      if (host) return host;
      if (typeof c.source === 'string' && c.source.trim()) return c.source.trim();
      return '';
    })();
    out.push({ url, title, publisher: publisher || undefined });
  }
  return out;
}

// 하위호환 alias — 테스트/타 모듈에서 다른 이름으로 import 해도 동작
export const buildSourceBundle = buildSourceBundleFromMarket;
export const createSourceBundle = buildSourceBundleFromMarket;
export const createSourceBundleFromMarket = buildSourceBundleFromMarket;
export const toSourceBundle = buildSourceBundleFromMarket;


/**
 * @param {object} input
 * @param {string} input.keyword
 * @param {string} [input.ymylRisk] 'none' | 'high' | ...
 * @param {object|array} [input.sourceBundle]
 * @param {string} [input.bodyHtml]  가격 as-of 점검용 본문 (HTML or plain)
 * @param {boolean} [input.hardNonYmyl] 비-YMYL 출처 없음도 차단할지 (기본 false)
 * @param {boolean} [input.plagiarismChecked] 표절 검사 실행 여부
 * @param {string} [input.keyword]  YMYL derive용 키워드
 * @param {string} [input.category]  YMYL derive용 카테고리
 * @returns {{ verdict:'pass'|'needs_review'|'fail', reasons:string[], warnings:string[] }}
 */
export function inspectProvenance({
  ymylRisk = 'none',
  sourceBundle = null,
  bodyHtml = '',
  hardNonYmyl = false,
  plagiarismChecked = false,
  keyword = '',
  category = ''
} = {}) {
  const reasons = [];
  const warnings = [];
  const sourceUrls = extractSourceUrls(sourceBundle);
  const hasSource = sourceUrls.length > 0;
  const hasOfficial = sourceUrls.some(isOfficialSourceUrl);
  let risk = String(ymylRisk ?? '').trim().toLowerCase();

  // normalize: empty / unknown → fail-closed (treat as high) or derive via detectYmylRisk
  if (!risk || risk === 'unknown' || risk === 'null' || risk === 'undefined') {
    let derived = null;
    const kw = String(keyword || '').trim();
    const cat = String(category || '').trim();
    if (kw || cat) {
      try {
        derived = _detectYmylRisk(kw, cat);
      } catch {
        derived = null;
      }
    }
    if (derived && typeof derived.risk === 'string' && derived.risk) {
      risk = String(derived.risk).trim().toLowerCase();
      // fail-closed: if derivation says none but original was unknown without keyword, stays high
      // If keyword was provided and derived is none, respect derived (not high)
      if (!risk) risk = 'high';
    } else {
      risk = 'high';
    }
  }

  // YMYL + 공식 출처 없음 → hard fail (generic blog URL은 공식 출처로 인정 안 됨)
  if ((risk === 'high' || risk === 'medium') && !hasOfficial) {
    if (hasSource && !hasOfficial) {
      reasons.push({ verdict: 'fail', code: 'ymyl-source-missing', message: 'YMYL 키워드인데 공식 도메인(gov.kr/korea.kr/fss.or.kr 등) 출처가 없다. 블로그/일반 URL은 YMYL 공식 출처로 인정 안 됨. 자동 발행 불가.' });
    } else {
      reasons.push({ verdict: 'fail', code: 'ymyl-source-missing', message: 'YMYL 키워드인데 구조화 공식 출처(sourceBundle URL)가 없다. 자동 발행 불가.' });
    }
  }

  // 비-YMYL + 출처 없음 → needs_review (관측 또는 하드 게이트)
  if ((risk !== 'high' && risk !== 'medium') && !hasSource) {
    if (hardNonYmyl) {
      reasons.push({ verdict: 'fail', code: 'source-missing-hard', message: 'PROVENANCE_HARD_GATE=1 — 비-YMYL 글도 출처 없는 자동 발행 불가.' });
    } else {
      reasons.push({ verdict: 'needs_review', code: 'source-missing', message: '구조화 출처(sourceBundle URL)가 없다. 검토 필요(review).' });
    }
  }

  // 가격 주장 + as-of 날짜 없음 → warning
  const plain = stripHtml(bodyHtml);
  if (PRICE_RE.test(plain) && !ASOF_RE.test(plain)) {
    warnings.push({ code: 'price-no-as-of', message: '가격/비용 주장이 있는데 기준일(as-of) 표기가 없다. "2026년 8월 기준" 명시 권장.' });
  }

  // 표절 검사 미실행 → 통과로 위장 금지
  if (!plagiarismChecked) {
    warnings.push({ code: 'plagiarism-unknown', message: '표절 검사가 실행되지 않았다. 실행을 통과로 간주하지 않는다(unknown).' });
  }

  const hasFail = reasons.some((r) => r.verdict === 'fail');
  const hasReview = reasons.some((r) => r.verdict === 'needs_review');
  const verdict = hasFail ? 'fail' : hasReview ? 'needs_review' : 'pass';
  return { verdict, reasons, warnings };
}