#!/usr/bin/env node
/**
 * public-site-qa.mjs — 공개 티스토리 표면 점검
 *
 * 로그인·발행·수정 없이 RSS, robots.txt, sitemap.xml, ads.txt와 공개 글만
 * 읽어 자동 발행/애드센스 운영에서 놓치기 쉬운 항목을 보고한다.
 *
 * 심도 모델 (advisory):
 *   - fatal   : 사이트 자체가 죽었거나 검색/애드센스 파일을 읽을 수 없는 상태
 *               (`blog-unreachable`, `ads-txt-unavailable`) → `--fail-on-blockers`
 *               가 exit 2.
 *   - advisory: 스킨이 주입한 태그(auto-refresh, skin-source-marker)나 기존 글의
 *               본문 품질(mixed-script, thin-body, markdown-leak, missing-canonical)
 *               같은 지적 → 보고·알림만 하고 발행을 막지 않는다.
 *
 * 배경: 2026-09-16에 이 게이트가 fail-closed로 굳어 10일간 발행 Job이 0건이었다.
 * 티스토리 스킨(webclub.tistory.com/354)이 모든 페이지 head에 <meta Refresh>와
 * 출처 마커를 주입하기 때문에, 스킨이 만드는 지적은 글 발행으로 해결되지 않는다.
 * 큐 wrapper는 경고·알림을 남기고 API는 classifySurface의 치명 코드만 차단한다.
 * assertPublicSiteReady는 수동 발행 경로의 엄격한 검사를 유지한다.
 */
import { parseHTML } from 'linkedom';
import { notifyPublicSiteQa } from '../lib/discord-notify.mjs';

const DEFAULT_BLOG_URL = 'https://acstory.tistory.com';
const USER_AGENT = 'ponslink-public-site-qa/1.0';

/** 사이트 자체가 다운됐을 때만 발행 시도를 막아야 하는 코드. */
export const FATAL_CODES = new Set(['blog-unreachable', 'ads-txt-unavailable']);

/**
 * `evaluateSiteSurface`가 돌려준 blockers를 치명/권고로 나눈다.
 *
 * @param {{ blockers?: { code: string }[] }} surface
 * @returns {{ fatal: { code: string }[], advisory: { code: string }[] }}
 */
export function classifySurface(surface) {
  const blockers = Array.isArray(surface?.blockers) ? surface.blockers : [];
  const fatal = blockers.filter((item) => FATAL_CODES.has(item?.code));
  const advisory = blockers.filter((item) => !FATAL_CODES.has(item?.code));
  return { fatal, advisory };
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function decodeXml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function extractFeedUrls(xml, limit = 10) {
  const urls = [];
  const seen = new Set();
  const items = [...String(xml || '').matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  for (const match of items) {
    const linkMatch = match[0].match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const url = decodeXml(linkMatch?.[1] || '').trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

export function extractSitemapArticleUrls(xml, blogUrl, limit = 50) {
  const origin = new URL(blogUrl).origin;
  const urls = [];
  const seen = new Set();
  for (const match of String(xml || '').matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const url = decodeXml(match[1]).trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    // Tistory canonical posts use numeric IDs or /entry/ slugs.
    if (parsed.origin !== origin || !/^\/(?:\d+|entry\/[^/]+)\/?$/.test(parsed.pathname)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

function metaContent(document, name, attr = 'name') {
  const wanted = String(name).toLowerCase();
  for (const meta of document.querySelectorAll('meta')) {
    if (String(meta.getAttribute(attr) || '').toLowerCase() === wanted) {
      return String(meta.getAttribute('content') || '').trim();
    }
  }
  return '';
}

function countMatches(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

export function inspectArticleHtml(html, url = '') {
  const { document } = parseHTML(String(html || ''));
  const content = document.querySelector('.contents_style')
    || document.querySelector('.article-view')
    || document.querySelector('article')
    || document.body;
  const articleHtml = content?.toString?.() || '';
  const headHtml = document.querySelector('head')?.toString?.() || '';
  const text = String(content?.textContent || '').replace(/\s+/g, ' ').trim();
  const metas = [...document.querySelectorAll('meta')];
  const refresh = metas.find((meta) => {
    const name = String(meta.getAttribute('name') || '').toLowerCase();
    const equiv = String(meta.getAttribute('http-equiv') || '').toLowerCase();
    return name === 'refresh' || equiv === 'refresh';
  });
  const canonical = [...document.querySelectorAll('link')].find((link) =>
    String(link.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes('canonical')
  )?.getAttribute('href') || '';
  const description = metaContent(document, 'description');
  const ogDescription = metaContent(document, 'og:description', 'property');
  const refreshValue = String(refresh?.getAttribute('content') || '').trim();
  const skinSourceMarkerCount = countMatches(headHtml, /출처\s*:\s*https?:\/\//gi);
  const mixedScript = /[\u3040-\u30ff]/u.test(text)
    || (/[가-힣]/u.test(text) && /[\u3400-\u4dbf\u4e00-\u9fff]{2,}/u.test(text));
  const markdownLeak = /!?\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)/i.test(text);
  const blockerCodes = [];
  const warningCodes = [];
  if (refresh) blockerCodes.push('auto-refresh');
  if (skinSourceMarkerCount >= 2 || /webclub\.tistory\.com\/354/i.test(headHtml)) blockerCodes.push('skin-source-marker');
  if (text.length < 1800) blockerCodes.push('thin-body');
  if (mixedScript) blockerCodes.push('mixed-script');
  if (markdownLeak) blockerCodes.push('markdown-leak');
  if (!canonical) blockerCodes.push('missing-canonical');
  if (!description) warningCodes.push('missing-description');
  if (description && description === ogDescription && description.length < 120) warningCodes.push('short-description');
  if (!document.querySelector('script[type="application/ld+json"]')) warningCodes.push('missing-structured-data');
  if (metaContent(document, 'page-enter')) warningCodes.push('legacy-page-transition');
  if (!content?.querySelector('h1')) warningCodes.push('missing-h1');
  if (!content?.querySelector('figure img, img')) warningCodes.push('missing-image');
  if (countMatches(articleHtml, /data:image\/[^;]+;base64,/gi)) warningCodes.push('inline-base64-image');
  return {
    url,
    ok: blockerCodes.length === 0,
    title: String(document.querySelector('title')?.textContent || '').trim(),
    canonical: String(canonical).trim(),
    descriptionLength: [...description].length,
    ogDescriptionLength: [...ogDescription].length,
    bodyChars: text.length,
    paragraphs: content?.querySelectorAll('p').length || 0,
    headings: content?.querySelectorAll('h1,h2,h3').length || 0,
    tables: content?.querySelectorAll('table').length || 0,
    figures: content?.querySelectorAll('figure').length || 0,
    images: content?.querySelectorAll('img').length || 0,
    adScripts: countMatches(String(document), /adsbygoogle|googlesyndication/gi),
    refresh: refreshValue || null,
    skinSourceMarkerCount,
    blockerCodes,
    warningCodes
  };
}

export function evaluateSiteSurface({ blogUrl, rootStatus, robotsStatus, sitemapStatus, adsStatus, articles = [] } = {}) {
  const blockers = [];
  const warnings = [];
  const normalizedBlog = normalizeUrl(blogUrl || DEFAULT_BLOG_URL);
  const hostedByTistory = /^https?:\/\/[^/]+\.tistory\.com$/i.test(normalizedBlog);
  if (rootStatus !== 200) blockers.push({ code: 'blog-unreachable', status: rootStatus });
  if (robotsStatus !== 200) warnings.push({ code: 'robots-unavailable', status: robotsStatus });
  if (sitemapStatus !== 200) warnings.push({ code: 'sitemap-unavailable', status: sitemapStatus });
  if (adsStatus !== 200) {
    if (hostedByTistory) {
      warnings.push({ code: 'ads-txt-platform-managed', status: adsStatus });
    } else {
      blockers.push({ code: 'ads-txt-unavailable', status: adsStatus });
    }
  }
  for (const article of articles) {
    for (const code of article.blockerCodes || []) blockers.push({ code, url: article.url });
    for (const code of article.warningCodes || []) warnings.push({ code, url: article.url });
  }
  return {
    blogUrl: normalizedBlog,
    ok: blockers.length === 0,
    verified: articles.length > 0,
    blockers,
    warnings,
    articlesChecked: articles.length
  };
}

async function fetchText(url) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    return { status: 0, text: '', error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runPublicSiteQa({ blogUrl = DEFAULT_BLOG_URL, limit = 10 } = {}) {
  const base = normalizeUrl(blogUrl);
  const [root, robots, sitemap, ads, feed] = await Promise.all([
    fetchText(`${base}/`),
    fetchText(`${base}/robots.txt`),
    fetchText(`${base}/sitemap.xml`),
    fetchText(`${base}/ads.txt`),
    fetchText(`${base}/rss`)
  ]);
  let urls = extractFeedUrls(feed.text, limit);
  if (!urls.length) urls = extractSitemapArticleUrls(sitemap.text, base, limit);
  const articles = [];
  for (const url of urls) {
    const page = await fetchText(url);
    const article = inspectArticleHtml(page.text, url);
    articles.push({ status: page.status, ...article });
  }
  const surface = evaluateSiteSurface({
    blogUrl: base,
    rootStatus: root.status,
    robotsStatus: robots.status,
    sitemapStatus: sitemap.status,
    adsStatus: ads.status,
    articles
  });
  // fail-open 수정: 글을 한 건도 못 읽었는데 blockers가 비어 있으면
  // `ok:true`(PASS)로 보고된다. 2026-09-16의 두 번의 "통과"가 바로 이 경로였다
  // — feed fetch가 status 0으로 실패해 articles가 빈 상태였고 검사할 것이
  // 없으니 차단도 없었다. 여기서는 실제 fetch 결과를 아므로 경고를 남긴다.
  if (articles.length === 0) {
    surface.warnings.push({ code: 'articles-unchecked', feed: feed.status, sitemap: sitemap.status });
    surface.verified = false;
  }
  return {
    checkedAt: new Date().toISOString(),
    surface,
    endpoints: {
      root: root.status,
      robots: robots.status,
      sitemap: sitemap.status,
      ads: ads.status,
      feed: feed.status,
      feedUrls: urls.length
    },
    articles
  };
}

export async function assertPublicSiteReady({
  blogUrl = DEFAULT_BLOG_URL,
  limit = 10,
  run = runPublicSiteQa
} = {}) {
  const report = await run({ blogUrl, limit });
  if (report?.surface?.ok) return report;
  const codes = [...new Set((report?.surface?.blockers || []).map((item) => item.code).filter(Boolean))];
  const error = new Error(`공개 사이트 QA 차단: ${codes.join(', ') || 'unknown'}`);
  error.code = 'public-site-qa-blocked';
  error.report = report;
  throw error;
}

function parseArgs(argv) {
  const args = {
    blogUrl: DEFAULT_BLOG_URL,
    limit: 10,
    json: false,
    failOnBlockers: false,
    strict: false,
    notify: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--blog-url' && argv[i + 1]) args.blogUrl = argv[++i];
    else if (argv[i] === '--limit' && argv[i + 1]) args.limit = Math.max(1, Number(argv[++i]) || 10);
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--fail-on-blockers') args.failOnBlockers = true;
    else if (argv[i] === '--strict') args.strict = true;
    else if (argv[i] === '--notify') args.notify = true;
    else if (argv[i] === '--help') {
      console.log(`사용법: node public-site-qa.mjs [옵션]

옵션:
  --blog-url URL       점검할 블로그 (기본: ${DEFAULT_BLOG_URL})
  --limit N            샘플링할 글 수 (기본: 10)
  --json               JSON 리포트 출력
  --fail-on-blockers   치명 코드(blog-unreachable, ads-txt-unavailable)가
                       있을 때만 exit 2 — 스킨/본문 권고는 exit 0
  --strict             어떤 blocker든 있으면 exit 2 (구 동작, 수동 점검용)
  --notify             blocker가 있으면 Discord 워크훅으로 알림
                       (중복은 6시간/state 파일로 억제)`);
      process.exit(0);
    }
  }
  return args;
}

/** 치명 → BLOCKED, 그 외 blocker → ADVISORY, 없으면 PASS. */
function verdictOf(surface) {
  const { fatal, advisory } = classifySurface(surface);
  if (fatal.length > 0) return { status: 'BLOCKED', fatal, advisory };
  if (advisory.length > 0) return { status: 'ADVISORY', fatal, advisory };
  return { status: 'PASS', fatal, advisory };
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await runPublicSiteQa(args);
  const { status, fatal, advisory } = verdictOf(report.surface);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`공개 사이트 QA: ${status} ${report.surface.blogUrl}`);
    console.log(`endpoint root=${report.endpoints.root} robots=${report.endpoints.robots} sitemap=${report.endpoints.sitemap} ads.txt=${report.endpoints.ads} feed=${report.endpoints.feed}`);
    console.log(`articles=${report.articles.length} fatal=${fatal.length} advisory=${advisory.length} warnings=${report.surface.warnings.length} verified=${report.surface.verified}`);
    // 치명은 BLOCK, 스킨·본문 지적은 ADVISORY로 분리해 표시한다.
    for (const item of fatal) console.log(`  BLOCK ${item.code}${item.url ? `: ${item.url}` : ''}`);
    for (const item of advisory) console.log(`  ADVISORY ${item.code}${item.url ? `: ${item.url}` : ''}`);
    for (const item of report.surface.warnings.slice(0, 20)) console.log(`  WARN ${item.code}${item.url ? `: ${item.url}` : ''}`);
  }

  if (args.notify && (fatal.length > 0 || advisory.length > 0)) {
    const notifyResult = await notifyPublicSiteQa({
      blogUrl: report.surface.blogUrl,
      fatal,
      advisory,
      warnings: report.surface.warnings,
      articlesChecked: report.surface.articlesChecked,
      checkedAt: report.checkedAt
    });
    if (!args.json) {
      if (notifyResult.skipped) console.log(`notify: skipped (${notifyResult.reason})`);
      else if (notifyResult.ok) console.log(`notify: sent${notifyResult.deduped ? ' (deduped)' : ''}`);
      else console.log(`notify: failed (${notifyResult.reason || notifyResult.error || 'unknown'})`);
    }
  } else if (args.notify && !args.json) {
    console.log('notify: skipped (no findings)');
  }

  // --fail-on-blockers는 이제 치명 코드에만 반응한다. 스킨이 만드는 권고는
  // 발행을 멈추지 않는다. 구 동작이 필요하면 --strict.
  if (args.strict && !report.surface.ok) process.exit(2);
  if (args.failOnBlockers && fatal.length > 0) process.exit(2);
}

if (process.argv[1]?.endsWith('public-site-qa.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
