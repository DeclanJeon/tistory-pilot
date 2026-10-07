/**
 * research.mjs — AI 영상 제작 튜토리얼 트랙의 다국어 리서치 수집기.
 *
 * - topics.json의 7개 주제를 서울 날짜 기준으로 순환한다.
 * - ko/en/ja/zh/es 5개 언어로 라이브 검색을 시도하고, 주제별 seed URL을 함께 fetch한다.
 * - 검색 결과는 발견용일 뿐 근거가 아니다. 직접 fetch·본문 추출·검증을 통과한 페이지만 sources에 남는다.
 * - 공개 HTTP(S)만 허용하고 loopback/사설·예약 주소/비HTTP 리다이렉트를 차단한다.
 * - 실패(검색 엔진 실패, WAF/로그인/빈 결과, 차단 URL, 비HTML, 얇은 페이지)는 성공으로 가장하지 않고
 *   failures[]에 기록한다.
 *
 * 수집 원문은 비신뢰 데이터다 — 프롬프트/실행 명령으로 사용하지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOPICS_PATH = path.join(MODULE_DIR, 'topics.json');

export const SEARCH_LANGUAGES = Object.freeze(['ko', 'en', 'ja', 'zh', 'es']);
export const MIN_LANGUAGES = 2;
export const MIN_SOURCES = 2;

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;
const MIN_TEXT_CHARS = 400;
const MAX_CANDIDATES = 24;
const MAX_SOURCES = 10;

// 검색 결과에서 제외할 호스트 — 로그인/앱/집계 페이지는 제작법 원문이 아니다.
const DENY_HOSTS = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|pinterest\.[a-z.]+|reddit\.com|quora\.com|linkedin\.com|play\.google\.com|apps\.apple\.com|chromewebstore\.google\.com|accounts\.google\.com|support\.google\.com\/accounts)$/i;
// 검색 엔진 자기 자신의 링크
const ENGINE_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|microsoft\.com\/translator|gstatic\.com|googleapis\.com)$/i;
// 파일 확장자 기준 제외 — HTML 문서만 근거로 쓴다.
const DENY_EXT = /\.(pdf|zip|gz|tar|7z|rar|mp4|mp3|wav|mov|avi|webm|png|jpe?g|gif|webp|svg|ico|css|js|json|xml|csv|xlsx?|docx?|pptx?)($|\?)/i;

const WAF_PATTERNS = /(cloudflare|just a moment|attention required|cf-browser-verification|ddos-guard|access denied|are you a robot|verify you are human|please enable javascript|security check|request blocked|pardon our interruption|akamai|incapsula|perimeterx|datadome)/i;
const LOGIN_PATTERNS = /(sign in to continue|log in to continue|please log in|please sign in|로그인이 필요|로그인 후 이용|ログインしてください|请先登录|iniciar sesión para continuar)/i;

// ─── 토픽 로딩/선택 ──────────────────────────────────────────────────

export async function loadTopics(filePath = TOPICS_PATH) {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  const topics = Array.isArray(data) ? data : data.topics;
  if (!Array.isArray(topics) || !topics.length) {
    throw new Error('topics.json에 유효한 주제가 없다.');
  }
  for (const topic of topics) {
    if (!topic.id || !topic.name || !topic.keyword || !topic.queries) {
      throw new Error(`topics.json 항목이 불완전하다: ${JSON.stringify(topic).slice(0, 120)}`);
    }
    for (const lang of SEARCH_LANGUAGES) {
      if (typeof topic.queries[lang] !== 'string' || !topic.queries[lang].trim()) {
        throw new Error(`주제 ${topic.id}의 ${lang} 검색어가 없다.`);
      }
    }
  }
  return topics;
}

function seoulDayNumber(now = new Date()) {
  // Asia/Seoul 달력일을 정수로 환산해 주제 순환에 쓴다.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return Math.floor(Date.UTC(get('year'), get('month') - 1, get('day')) / 86400000);
}

/**
 * 서울 날짜 기준 7개 주제 순환. topicId가 주어지면 그 주제를 반환한다.
 * @param {object} arg - {topics, topicId?, now?} 또는 주제 배열
 */
export function selectTopic(arg = {}) {
  const topics = Array.isArray(arg) ? arg : arg.topics;
  if (!Array.isArray(topics) || !topics.length) {
    throw new Error('selectTopic: 주제 목록이 비어 있다.');
  }
  const topicId = typeof arg === 'object' && !Array.isArray(arg) ? arg.topicId : '';
  if (topicId) {
    const found = topics.find((t) => t.id === topicId);
    if (!found) throw new Error(`selectTopic: 알 수 없는 주제 id: ${topicId}`);
    return found;
  }
  const now = arg.now ? new Date(arg.now) : new Date();
  return topics[seoulDayNumber(now) % topics.length];
}

/** 하위호환/부모 편의용 — 날짜 시드 없이 id로만 해석할 때 사용한다. */
export function resolveTopic(topics, topicOrId) {
  if (topicOrId && typeof topicOrId === 'object') return topicOrId;
  return selectTopic({ topics, topicId: topicOrId });
}

// ─── 주소 안전성 ─────────────────────────────────────────────────────

export function parseIpv4(host) {
  const parts = String(host).split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return Number(p);
  });
  return nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? nums : null;
}

export function isPrivateIpv4(host) {
  const n = parseIpv4(host);
  if (!n) return false;
  const [a, b] = n;
  if (a === 0 || a === 10 || a === 127) return true;                 // this-net, RFC1918, loopback
  if (a === 169 && b === 254) return true;                         // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;                // RFC1918
  if (a === 192 && b === 168) return true;                         // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true;               // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true;            // benchmark
  if ((a === 192 && b === 0) || (a === 198 && b === 51) || (a === 203 && b === 0)) return true; // doc/test-net
  if (a === 224 || a >= 240) return true;                          // multicast/reserved
  return false;
}

export function isPrivateHost(host) {
  const h = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home') || h.endsWith('.corp')) return true;
  if (h === 'metadata.google.internal') return true;
  if (net.isIPv4(h)) return isPrivateIpv4(h);
  if (net.isIPv6(h)) {
    const flat = h.replace(/^\[|\]$/g, '').toLowerCase();
    if (flat === '::' || flat === '::1') return true;
    if (flat.startsWith('fe80') || flat.startsWith('fe90') || flat.startsWith('fea0') || flat.startsWith('feb0')) return true; // link-local
    if (/^f[cd]/.test(flat)) return true;                          // unique-local fc00::/7
    if (flat.startsWith('ff')) return true;                        // multicast
    if (flat.startsWith('2001:db8')) return true;                  // documentation
    const mapped = flat.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }
  const v4 = parseIpv4(h);
  if (v4) return isPrivateIpv4(h);
  return false;
}

const defaultAddressLookup = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

async function assertPublicUrl(url, { addressLookup = defaultAddressLookup } = {}) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error(`invalid-url: ${String(url).slice(0, 120)}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`unsupported-protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('credential-url: 자격 증명이 포함된 URL은 허용하지 않는다.');
  }
  const host = parsed.hostname;
  if (!host) throw new Error('empty-host');
  if (isPrivateHost(host)) {
    throw new Error(`private-host: ${host}`);
  }
  if (!net.isIP(host)) {
    let addresses = [];
    try {
      addresses = await addressLookup(host);
    } catch {
      throw new Error(`dns-failure: ${host}`);
    }
    if (!addresses.length) throw new Error(`dns-empty: ${host}`);
    const privateAddr = addresses.find((a) => isPrivateHost(a));
    if (privateAddr) {
      throw new Error(`private-address: ${host} resolves to ${privateAddr}`);
    }
  }
  return parsed;
}

// ─── fetch 래퍼 ──────────────────────────────────────────────────────

async function readBodyCapped(response, maxBytes) {
  const len = Number(response.headers?.get('content-length') || 0);
  if (len > maxBytes) throw new Error(`oversize-content-length: ${len}`);
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`oversize-body: ${buf.length}`);
  return buf;
}

/**
 * 공개-안전 fetch: 리다이렉트를 수동 처리하며 매 홉마다 주소/프로토콜을 재검증한다.
 * @returns {{response, finalUrl, redirected:boolean}}
 */
export async function safeFetch(url, {
  fetchImpl = fetch,
  addressLookup = defaultAddressLookup,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRedirects = MAX_REDIRECTS,
  maxBytes = MAX_PAGE_BYTES,
  headers = {}
} = {}) {
  let current = String(url);
  let redirected = false;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current, { addressLookup });
    const response = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'accept-language': 'ko,en;q=0.8,ja;q=0.6,zh;q=0.5,es;q=0.4',
        ...headers
      }
    });
    const status = Number(response.status || 0);
    if (status >= 300 && status < 400) {
      const location = response.headers?.get('location');
      if (!location) throw new Error(`redirect-without-location: ${status}`);
      const next = new URL(location, current).toString();
      if (!/^https?:\/\//i.test(next)) {
        throw new Error(`blocked-redirect: 비HTTP 리다이렉트(${next.slice(0, 80)})`);
      }
      if (response.body?.cancel) await response.body.cancel().catch(() => {});
      current = next;
      redirected = true;
      continue;
    }
    return { response, finalUrl: current, redirected };
  }
  throw new Error(`too-many-redirects: ${url}`);
}

// ─── HTML 추출/검증 ──────────────────────────────────────────────────

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ' ';
    });
}

function regexExtractText(html) {
  const cleaned = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|iframe|svg|canvas|template|form|button|select|textarea|nav|footer|aside|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|article|section|blockquote|figure|figcaption|td|th|br|ul|ol|table)>/gi, '\n')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(cleaned)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2)
    .join('\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function regexExtractTitle(html) {
  const og = String(html).match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || String(html).match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decodeEntities(og[1]).replace(/\s+/g, ' ').trim();
  const title = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? decodeEntities(title[1]).replace(/\s+/g, ' ').trim() : '';
}

let domParserPromise = null;
async function getDomParser() {
  if (!domParserPromise) {
    domParserPromise = import('linkedom')
      .then((mod) => new mod.DOMParser())
      .catch(() => null);
  }
  return domParserPromise;
}

async function extractFromHtml(html) {
  const parser = await getDomParser();
  if (parser) {
    try {
      const doc = parser.parseFromString(String(html), 'text/html');
      doc.querySelectorAll('script,style,noscript,iframe,svg,canvas,template,form,button,select,textarea,nav,footer,aside')
        .forEach((node) => node.remove());
      const title = (
        doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
        || doc.querySelector('title')?.textContent
        || doc.querySelector('h1')?.textContent
        || ''
      ).replace(/\s+/g, ' ').trim();
      const root = doc.querySelector('article')
        || doc.querySelector('main')
        || doc.querySelector('[role="main"]')
        || doc.body;
      const text = (root?.textContent || '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (text) return { title, text };
    } catch {
      // fall through to regex
    }
  }
  return { title: regexExtractTitle(html), text: regexExtractText(html) };
}

export function detectLanguage(text) {
  const sample = String(text || '').slice(0, 20000);
  const count = (re) => (sample.match(re) || []).length;
  const hangul = count(/[가-힯]/g);
  const kana = count(/[぀-ヿ]/g);
  const cjk = count(/[一-鿿]/g);
  if (hangul >= 15 && hangul > kana * 2) return 'ko';
  if (kana >= 10) return 'ja';
  if (cjk >= 40) return 'zh';
  const latinWords = (sample.toLowerCase().match(/[a-záéíóúüñ]+/g) || []);
  if (latinWords.length >= 15) {
    const text2 = ` ${latinWords.join(' ')} `;
    const hits = (words) => words.reduce((n, w) => n + (text2.includes(` ${w} `) ? 1 : 0), 0);
    const es = hits(['el', 'la', 'los', 'las', 'de', 'en', 'que', 'para', 'con', 'una', 'del', 'por', 'cómo', 'como', 'vídeo', 'video', 'crear', 'guía', 'tutorial', 'generar']);
    const en = hits(['the', 'and', 'to', 'of', 'in', 'for', 'how', 'with', 'a', 'an', 'video', 'create', 'guide', 'tutorial', 'ai', 'your', 'you']);
    if (/[áéíóúüñ¿¡]/.test(sample) && es >= 3) return 'es';
    if (es >= 6 && es > en * 1.2) return 'es';
    if (en >= 4) return 'en';
    if (es >= 4) return 'es';
  }
  return 'unknown';
}

/**
 * 페이지 검증 — 제목/본문이 있는 실제 문서만 근거로 인정한다.
 * @returns {{ok:boolean, reason?:string, title:string, text:string, language:string}}
 */
export function verifyPage({ title = '', text = '', url = '' } = {}) {
  const probe = `${title} ${String(text).slice(0, 4000)}`;
  if (WAF_PATTERNS.test(probe)) {
    return { ok: false, reason: 'blocked-page: WAF/봇 차단 응답으로 보인다', title, text: '', language: 'unknown' };
  }
  if (LOGIN_PATTERNS.test(probe)) {
    return { ok: false, reason: 'login-required: 로그인 요구 페이지', title, text: '', language: 'unknown' };
  }
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length < MIN_TEXT_CHARS) {
    return { ok: false, reason: `thin-content: 본문 ${clean.length}자 < ${MIN_TEXT_CHARS}자`, title, text: '', language: 'unknown' };
  }
  if (!String(title || '').trim()) {
    return { ok: false, reason: 'no-title: 제목을 확인할 수 없다', title, text: '', language: 'unknown' };
  }
  const language = detectLanguage(clean);
  if (language === 'unknown') {
    return { ok: false, reason: 'language-unknown: 언어를 판별할 수 없다', title, text: '', language };
  }
  return { ok: true, title: String(title).trim(), text: clean.slice(0, MAX_TEXT_CHARS), language };
}

// ─── 검색 ────────────────────────────────────────────────────────────

function decodeSearchHref(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    const uParam = u.searchParams.get('u');
    if (uParam && /^https?:/i.test(uParam)) return uParam;
    if (uParam && uParam.startsWith('//')) return `https:${uParam}`;
    if (uParam && /^\/\/[a-z0-9]/i.test(uParam)) return `https:${uParam}`;
  } catch { /* ignore */ }
  return href;
}

const BING_LOCALES = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', es: 'es-ES' };
const GOOGLE_LOCALES = { ko: 'kr', en: 'us', ja: 'jp', zh: 'cn', es: 'es' };

export const SEARCH_ENGINES = Object.freeze([
  {
    id: 'ddg',
    urlFor: (query, lang) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${lang === 'ko' ? 'kr-kr' : lang === 'ja' ? 'jp-jp' : lang === 'zh' ? 'cn-zh' : lang === 'es' ? 'es-es' : 'us-en'}`,
    extract(html) {
      const out = [];
      for (const m of String(html).matchAll(/class="result__a"[^>]*href="([^"]+)"/gi)) {
        const href = decodeSearchHref(m[1]);
        if (/^https?:\/\//i.test(href)) out.push(href);
      }
      if (!out.length) {
        for (const m of String(html).matchAll(/href="([^"]*uddg=[^"]+)"/gi)) {
          const href = decodeSearchHref(m[1].replace(/&amp;/g, '&'));
          if (/^https?:\/\//i.test(href)) out.push(href);
        }
      }
      return out;
    }
  },
  {
    id: 'bing',
    urlFor: (query, lang) => `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=${BING_LOCALES[lang] || 'en-US'}&cc=${lang === 'zh' ? 'cn' : lang}&count=20`,
    extract(html) {
      const out = [];
      for (const m of String(html).matchAll(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/gi)) {
        if (/^https?:\/\//i.test(m[1])) out.push(m[1]);
      }
      if (!out.length) {
        for (const m of String(html).matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/gi)) {
          if (/class="[^"]*tilk[^"]*"/i.test(m[0]) || /<h2/i.test(m[0])) out.push(m[1]);
        }
      }
      return out;
    }
  },
  {
    id: 'google',
    urlFor: (query, lang) => `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${GOOGLE_LOCALES[lang] || 'us'}&num=20`,
    extract(html) {
      const out = [];
      for (const m of String(html).matchAll(/href="\/url\?q=([^&"]+)[^"]*"/gi)) {
        const href = decodeURIComponent(m[1]);
        if (/^https?:\/\//i.test(href)) out.push(href);
      }
      if (!out.length) {
        for (const m of String(html).matchAll(/<a[^>]+href="(https?:\/\/[^"&]+)"[^>]*>/gi)) {
          out.push(m[1]);
        }
      }
      return out;
    }
  }
]);

function candidateAllowed(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    if (ENGINE_HOSTS.test(host)) return false;
    if (DENY_HOSTS.test(host)) return false;
    if (DENY_EXT.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function canonicalUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ref_src|spm|igshid|mc_)/i.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    return u.toString();
  } catch {
    return String(rawUrl);
  }
}

/** 같은 문서의 현지화 판별 — 로케일 경로를 벗긴 호스트+경로. */
export function documentIdentity(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const pathOnly = u.pathname
      .replace(/^\/(ko|kr|en|us|jp|ja|zh|cn|tw|es|mx|fr|de|it|pt|br|in|id|th|vi|nl|se|dk|no|fi|pl|ru|ar|tr|uk|ca|au|nz|sg|my|ph|hk)([-_][a-z]{2,4})?(?=\/|$)/i, '')
      .replace(/\/+$/, '');
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${pathOnly}`.toLowerCase();
  } catch {
    return String(rawUrl).toLowerCase();
  }
}

export function isProductionMethodSource(source) {
  let url;
  try { url = new URL(source?.finalUrl || source?.url); } catch { return false; }
  if (!url.pathname.replace(/\/|index\.(?:html?|php)/gi, '')) return false;
  const subject = `${source.title || ''} ${url.pathname}`;
  const creative = /storyboard|keyframe|character|video|film|camera|prompt|animation|commercial|flow|mood.?board|boards|brand|스토리보드|콘티|캐릭터|영상|촬영|프롬프트|광고|動画|映像|絵コンテ|キャラクター|ボード|プロンプト|分镜|故事板|角色|视频|镜头|提示词|guion|personaje|vídeo|anuncio/i;
  if (!creative.test(subject)) return false;
  const text = String(source.text || '');
  const methods = [
    /prompt|프롬프트|プロンプト|提示词/i,
    /reference|consistent|참조|일관|参照|一貫|参考|一致|referencia/i,
    /frame|camera|shot|프레임|카메라|컷|フレーム|カメラ|镜头|画面|fotograma|cámara/i,
    /step|how to|create|guide|supports?|supported|단계|만들|생성|방법|作成|生成|手順|创建|制作|步骤|crear|guía/i
  ];
  return text.length >= MIN_TEXT_CHARS && methods.filter(pattern => pattern.test(text)).length >= 2;
}

export function productionSourceCoverage(sources = []) {
  const methods = sources.filter(isProductionMethodSource);
  const documents = new Set(methods.map(source => documentIdentity(source.finalUrl || source.url)));
  const languages = new Set(methods.map(source => source.language).filter(language => SEARCH_LANGUAGES.includes(language)));
  const sites = new Set(methods.map(source => new URL(source.finalUrl || source.url).hostname.replace(/^www\./, '')));
  return { ok: documents.size >= MIN_SOURCES && languages.size >= MIN_LANGUAGES && sites.size >= 2,
    documents: documents.size, languages: languages.size, sites: sites.size };
}

async function runSearch(engine, query, language, options) {
  const url = engine.urlFor(query, language);
  try {
    const { response } = await safeFetch(url, { ...options, timeoutMs: options.searchTimeoutMs || options.timeoutMs });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.code = `search-http-${response.status}`;
      if (response.body?.cancel) await response.body.cancel().catch(() => {});
      throw err;
    }
    const buf = await readBodyCapped(response, MAX_PAGE_BYTES);
    const html = buf.toString('utf8');
    const urls = engine.extract(html).filter(candidateAllowed);
    return { urls };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

// ─── 페이지 fetch → source 레코드 ────────────────────────────────────

async function fetchSourcePage(rawUrl, sourceKind, options) {
  const { fetchImpl, addressLookup, timeoutMs } = options;
  let finalUrl, title, text, reader = null;
  if (fetchImpl === fetch) {
    await assertPublicUrl(rawUrl, { addressLookup });
    const cli = path.resolve(MODULE_DIR, '../../../node_modules/agbrowse/bin/agbrowse.mjs');
    const result = await execFileAsync(process.execPath, [
      cli, 'fetch', rawUrl, '--json', '--browser', 'never', '--browser-session', 'none',
      '--max-bytes', String(MAX_PAGE_BYTES), '--timeout-ms', String(timeoutMs)
    ], { timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
    reader = JSON.parse(result.stdout);
    if (!['strong_ok', 'weak_ok'].includes(reader.verdict) || reader.safetyFlags?.length) {
      throw new Error(`reader-rejected: ${reader.verdict || reader.summary || 'no verified content'}`);
    }
    if (reader.ok && reader.verdict === 'strong_ok' && !reader.contentTruncated) {
      finalUrl = reader.finalUrl;
      await assertPublicUrl(finalUrl, { addressLookup });
      title = reader.title;
      text = reader.content;
    }
  }
  // Weak extraction is not evidence: independently fetch and validate the full page.
  if (!text) {
    const fetched = await safeFetch(rawUrl, { fetchImpl, addressLookup, timeoutMs });
    finalUrl = fetched.finalUrl;
    const { response } = fetched;
    if (!response.ok) {
      if (response.body?.cancel) await response.body.cancel().catch(() => {});
      throw new Error(`http-${response.status}`);
    }
    const contentType = String(response.headers?.get('content-type') || '').toLowerCase();
    if (contentType && !/html|text\/plain/.test(contentType)) {
      if (response.body?.cancel) await response.body.cancel().catch(() => {});
      throw new Error(`non-html: ${contentType.split(';')[0]}`);
    }
    const buf = await readBodyCapped(response, MAX_PAGE_BYTES);
    ({ title, text } = await extractFromHtml(buf.toString('utf8')));
  }
  const check = verifyPage({ title, text, url: finalUrl });
  if (!check.ok) {
    const err = new Error(check.reason);
    err.finalUrl = finalUrl;
    throw err;
  }
  if (!isProductionMethodSource({ title: check.title, text: check.text, finalUrl })) {
    const error = new Error('not-production-method: 일반 홈페이지·도구 목록은 제작법 근거가 아니다.');
    error.finalUrl = finalUrl;
    throw error;
  }
  const contentSha256 = crypto.createHash('sha256').update(check.text, 'utf8').digest('hex');
  return {
    url: rawUrl,
    finalUrl,
    title: check.title,
    language: check.language,
    retrievedAt: options.now().toISOString(),
    contentSha256,
    text: check.text,
    sourceKind,
    ...(reader ? { reader: { source: reader.source, verdict: reader.verdict, chromeUsed: reader.chromeUsed, attempts: reader.attempts } } : {})
  };
}

// ─── collectResearch ─────────────────────────────────────────────────

/**
 * @param {object} arg
 * @param {object|string} arg.topic - topics.json 항목 또는 id
 * @param {string} arg.outputDir - references/ 가 생성될 디렉터리(비우면 파일 기록 생략)
 * @param {Function} [arg.fetchImpl]
 * @param {Date|string} [arg.now]
 * @param {object} [arg.topics] - topic이 id일 때 해석용
 * @param {object} [arg.limits]
 * @param {Function} [arg.addressLookup] - 테스트용 DNS 주입
 * @returns {Promise<{ok:boolean, sources:Array, searches:Array, failures:Array, summary:object}>}
 */
export async function collectResearch({
  topic,
  outputDir = '',
  fetchImpl = fetch,
  now = new Date(),
  topics = null,
  addressLookup = defaultAddressLookup,
  limits = {}
} = {}) {
  const startNow = now instanceof Date ? now : new Date(now);
  const resolvedTopic = typeof topic === 'string'
    ? resolveTopic(topics || (await loadTopics()), topic)
    : resolveTopic([], topic);
  if (!resolvedTopic || !resolvedTopic.queries) {
    throw new Error('collectResearch: 유효한 topic이 필요하다.');
  }

  const sources = [];
  const searches = [];
  const failures = [];
  const seenUrls = new Map();
  const timeouts = { timeoutMs: limits.timeoutMs || DEFAULT_TIMEOUT_MS, searchTimeoutMs: limits.searchTimeoutMs };
  const fetchOptions = { fetchImpl, addressLookup, timeoutMs: timeouts.timeoutMs, searchTimeoutMs: timeouts.searchTimeoutMs };
  const maxCandidates = limits.maxCandidates || MAX_CANDIDATES;
  const maxSources = limits.maxSources || MAX_SOURCES;

  const candidateQueue = [];

  // 1) 5개 언어 라이브 검색 — 모든 엔진을 시도하고 실패도 기록한다.
  for (const language of SEARCH_LANGUAGES) {
    const query = resolvedTopic.queries[language];
    if (!query) {
      searches.push({ language, query: '', engine: 'all', status: 'error', results: 0, error: 'missing-query' });
      continue;
    }
    let languageUrls = [];
    let lastError = '';
    let engineAttempts = 0;
    for (const engine of SEARCH_ENGINES) {
      engineAttempts++;
      const result = await runSearch(engine, query, language, fetchOptions);
      if (result.error) {
        lastError = `${engine.id}: ${result.error}`;
        searches.push({ language, query, engine: engine.id, status: 'error', results: 0, error: result.error });
        continue;
      }
      const unique = result.urls.filter((u) => !seenUrls.has(canonicalUrl(u)));
      searches.push({ language, query, engine: engine.id, status: unique.length ? 'ok' : 'empty', results: unique.length });
      if (unique.length) {
        languageUrls = unique;
        break; // 첫 성공 엔진 결과로 충분 — 과도한 요청 방지
      }
      lastError = `${engine.id}: empty`;
    }
    if (!languageUrls.length && engineAttempts) {
      failures.push({
        stage: 'search',
        language,
        query,
        reason: `search-failed: 모든 엔진 실패 또는 빈 결과 (${lastError})`
      });
    }
    for (const u of languageUrls) {
      const key = canonicalUrl(u);
      if (!seenUrls.has(key)) {
        seenUrls.set(key, { kind: 'search', language });
        candidateQueue.push({ url: u, language, kind: 'search' });
      }
    }
  }

  // 2) seed 후보 — 실행 시점에 다시 읽어야 하는 검증 가능한 공식 자료.
  for (const seed of resolvedTopic.seeds || []) {
    const key = canonicalUrl(seed);
    const existing = candidateQueue.find(candidate => canonicalUrl(candidate.url) === key);
    if (existing) {
      Object.assign(existing, { url: seed, kind: 'seed', language: '' });
    } else {
      seenUrls.set(key, { kind: 'seed', language: '' });
      candidateQueue.push({ url: seed, language: '', kind: 'seed' });
    }
  }

  // 3) 후보 fetch — seed를 먼저 시도하고 검색 후보를 언어 순서대로 채운다.
  const ordered = [
    ...candidateQueue.filter((c) => c.kind === 'seed'),
    ...candidateQueue.filter((c) => c.kind === 'search')
  ].slice(0, maxCandidates);

  for (const candidate of ordered) {
    if (sources.length >= maxSources) break;
    try {
      const record = await fetchSourcePage(candidate.url, candidate.kind, {
        fetchImpl, addressLookup, timeoutMs: timeouts.timeoutMs,
        now: () => new Date()
      });
      // 동일 문서(현지화만 다른)는 하나만 남긴다.
      const identity = documentIdentity(record.finalUrl);
      if (sources.some((s) => documentIdentity(s.finalUrl) === identity)) {
        continue;
      }
      record.id = `src-${String(sources.length + 1).padStart(2, '0')}`;
      sources.push(record);
    } catch (error) {
      failures.push({
        stage: 'fetch',
        url: candidate.url,
        finalUrl: error.finalUrl || '',
        language: candidate.language || undefined,
        sourceKind: candidate.kind,
        reason: String(error?.message || error)
      });
    }
  }

  // 4) references/ 보존 — 수집 원문은 프로젝트에 남긴다(게시물에는 요약+링크만).
  if (outputDir) {
    try {
      const refDir = path.join(outputDir, 'references');
      await fs.mkdir(refDir, { recursive: true });
      for (const source of sources) {
        await fs.writeFile(
          path.join(refDir, `${source.id}.txt`),
          `URL: ${source.url}\nFINAL: ${source.finalUrl}\nTITLE: ${source.title}\nLANGUAGE: ${source.language}\nSHA256: ${source.contentSha256}\nRETRIEVED: ${source.retrievedAt}\nKIND: ${source.sourceKind}\n\n${source.text}\n`,
          'utf8'
        );
      }
      await fs.writeFile(
        path.join(refDir, 'index.json'),
        JSON.stringify({ collectedAt: startNow.toISOString(), topic: resolvedTopic.id, sources: sources.map(({ text, ...meta }) => meta), searches, failures }, null, 2),
        'utf8'
      );
    } catch (error) {
      failures.push({ stage: 'persist', reason: `references 기록 실패: ${error.message}` });
    }
  }

  const languagesUsed = [...new Set(sources.map((s) => s.language))];
  const docIds = new Set(sources.map((s) => documentIdentity(s.finalUrl)));
  const summary = {
    topic: resolvedTopic.id,
    languagesAttempted: SEARCH_LANGUAGES.length,
    sourcesCollected: sources.length,
    languagesUsed,
    distinctDocuments: docIds.size,
    searchesEmptyOrFailed: failures.filter((f) => f.stage === 'search').length,
    fetchFailures: failures.filter((f) => f.stage === 'fetch').length,
    distinctSites: productionSourceCoverage(sources).sites,
    ok: productionSourceCoverage(sources).ok
  };
  if (!summary.ok) {
    failures.push({
      stage: 'coverage',
      reason: `insufficient-sources: sources=${sources.length}, languages=${languagesUsed.join('/') || 'none'} (최소 ${MIN_SOURCES}개 서로 다른 문서, ${MIN_LANGUAGES}개 언어 필요)`
    });
  }

  for (const f of failures) {
    console.warn(`[research] ${f.stage}: ${f.reason}${f.url ? ` (${f.url})` : ''}`);
  }

  return { ok: summary.ok, sources, searches, failures, summary };
}

export default collectResearch;
