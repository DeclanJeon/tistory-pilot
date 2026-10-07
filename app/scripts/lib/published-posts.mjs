#!/usr/bin/env node
/**
 * published-posts.mjs — 발행 중복 방지 모듈
 *
 * 중복 발행 판정의 두 출처:
 *   1) 발행 원장(ledger) — content/published.json
 *      이 파이프라인이 실제 발행한 키워드 ID·제목을 기록한다. RSS 창 밖으로
 *      밀려난 발행분도 ID와 주제로 비교한다. 과거 작업 ID 원장도 제목으로 판정한다.
 *   2) 블로그 RSS — https://<blog>/rss (최근 50건)
 *      state.json/원장이 초기화되거나 ID 체계가 바뀌어도(예: tech-01 → tech-01-v2)
 *      같은 주제가 다시 발행되는 것을 제목 유사도로 막는다. 08-01 배포처럼 원장이
 *      리셋되어도 실제 블로그가 최종 진실 원천(source of truth)이다.
 *
 * 판정 규칙 (하나라도 만족하면 중복):
 *   a. 정규화 키워드/제목이 발행 제목의 부분 문자열 (또는 역방향)
 *   b. 키워드의 모든 토큰이 발행 제목에 등장 (부분집합)
 *   c. 키워드 앞 2토큰 바이그램이 발행 제목에 연속 등장 + 공통 토큰 ≥ 2
 *   d. 정규화 제목 완전 일치
 *   e. 발행 원장에 같은 기본 키워드 ID 기록
 *
 * 주의: 규칙 c는 의도적으로 보수적(과잉 차단)이다. "정수기 렌탈 비교"가
 * "정수기 렌탈 위약금" 제목과 바이그램으로 겹쳐 차단될 수 있는데, 두 주제 모두
 * 이미 발행된 경우이므로 실무상 손실이 없다. 중복 발행이 더 큰 비용이다.
 *
 * 사용법:
 *   node scripts/lib/published-posts.mjs --seed https://acstory.tistory.com \
 *     [--ledger content/published.json] [--keywords content/keywords/keywords.json]
 *     → 블로그 RSS를 읽어 발행 원장을 처음 만든다 (멱등: 기존 원장 유지 + 신규만 추가)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BLOG_URL = 'https://acstory.tistory.com';
const DEFAULT_LEDGER_PATH = path.resolve(import.meta.dirname, '..', '..', 'content', 'published.json');

// ─── 정규화 ─────────────────────────────────────────────────────────

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '-', '&middot;': '·', '&hellip;': '…'
};

export function unescapeXml(text = '') {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/gi, m => ENTITIES[m.toLowerCase()] ?? ' ');
}

/**
 * 제목/키워드를 비교용으로 정규화:
 * - 소문자화, HTML 엔티티 해제
 * - 숫자-한글 경계 분리 (30평 → 30 평, 9급 → 9 급)
 * - 독립 연도 토큰 제거 (2026, 2026년)
 * - 기호를 공백으로 치환, 연속 공백 정리
 */
export function normalizeTitle(text = '') {
  return unescapeXml(text)
    .toLowerCase()
    // 독립 연도 토큰 제거 (2026, 2026년, 2026 년) — JS \b는 ASCII만 인식하므로
    // 한글 인접 경계는 lookaround로 처리한다. "2024년 조건" vs "2026년 조건"은 같은 주제.
    .replace(/(?<!\d)20\d\d(?:년)?(?:\s*년)?(?!\d)/g, ' ')
    // 숫자-한글 경계 분리 (30평 → 30 평, 9급 → 9 급)
    .replace(/(\d)([가-힣])/g, '$1 $2')
    .replace(/([가-힣])(\d)/g, '$1 $2')
    .replace(/[^가-힣a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeTitle(text = '') {
  return normalizeTitle(text)
    .split(' ')
    .filter(t => t.length >= 2);
}

/** Keep article identifiers; remove only tracking information. */
export function canonicalSourceUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.protocol = 'https:';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return '';
  }
}

function newsSourceUrls(post) {
  if (!post.news && !String(post.id || post.keywordId || '').startsWith('news-')) return [];
  const values = [];
  const visit = value => {
    if (typeof value === 'string') values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if (value.url) visit(value.url);
      for (const key of ['articles', 'urls', 'sources', 'links']) if (value[key]) visit(value[key]);
    }
  };
  visit(post.news);
  visit(post.sourceBundle);
  return [...new Set(values.map(canonicalSourceUrl).filter(Boolean))];
}

// ─── RSS 수집 ───────────────────────────────────────────────────────

export function parseRss(xml = '') {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const grab = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
    return m ? unescapeXml(m[1]).trim() : '';
  };
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = grab(block, 'title');
    if (!title) continue;
    items.push({
      title,
      url: grab(block, 'link'),
      pubDate: grab(block, 'pubDate')
    });
  }
  return items;
}

/** 블로그 RSS에서 최근 발행 글 목록을 가져온다. 실패 시 throw. */
export async function fetchPublishedTitles(blogUrl = DEFAULT_BLOG_URL, { timeoutMs = 10000 } = {}) {
  const rssUrl = `${blogUrl.replace(/\/+$/, '')}/rss`;
  const res = await fetch(rssUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`RSS 응답 오류: ${res.status} ${rssUrl}`);
  const xml = await res.text();
  const items = parseRss(xml);
  if (items.length === 0) throw new Error(`RSS에서 글을 찾을 수 없음: ${rssUrl}`);
  return items;
}

// ─── 제목 유사도 판정 ───────────────────────────────────────────────

/**
 * 후보 키워드/제목이 발행 목록 중 하나와 중복인지 판정.
 * 반환: { matched, rule, against } — against는 매칭된 발행 글.
 */
export function matchByTitle({ keyword = '', title = '' }, publishedTitles = []) {
  const candKw = normalizeTitle(keyword);
  const candTitle = normalizeTitle(title);
  const kwTokens = tokenizeTitle(keyword);

  for (const p of publishedTitles) {
    const pt = normalizeTitle(p.title);
    if (!pt) continue;

    // d. 제목 완전 일치
    if (candTitle && candTitle === pt) return { matched: true, rule: 'exact-title', against: p };

    // a. 부분 문자열 (키워드 ⊂ 발행 제목 또는 역방향)
    if (candKw.length >= 2 && (pt.includes(candKw) || candKw.includes(pt))) {
      return { matched: true, rule: 'substring', against: p };
    }

    if (kwTokens.length === 0) continue;
    const pTokens = tokenizeTitle(p.title);
    if (pTokens.length === 0) continue;
    const pSet = new Set(pTokens);

    // b. 키워드 토큰 부분집합
    if (kwTokens.every(t => pSet.has(t))) {
      return { matched: true, rule: 'token-subset', against: p };
    }

    // c. 앞 2토큰 바이그램 연속 등장 + 공통 토큰 ≥ 2
    if (kwTokens.length >= 2) {
      const bigram = `${kwTokens[0]} ${kwTokens[1]}`;
      const overlap = kwTokens.filter(t => pSet.has(t)).length;
      if (pTokens.join(' ').includes(bigram) && overlap >= 2) {
        return { matched: true, rule: 'bigram', against: p };
      }
    }

    // e. 의미적 유사도 — 공통 토큰 비율(overlap coefficient) ≥ 0.6이면 같은 주제로 본다.
    // "정수기 렌탈 위약금" vs "비데 렌탈 위약금"(2/3=0.67), "화장실 리모델링 비용" vs
    // "주방 리모델링 비용"(2/3=0.67)처럼 제품·공간만 다른 반복을 차단한다.
    // "이사 비용" vs "청소 비용"(1/2=0.5)처럼 의도어만 겹치는 경우는 통과시킨다.
    if (kwTokens.length >= 2 && pTokens.length >= 2) {
      const kwSet = new Set(kwTokens);
      const pSet2 = new Set(pTokens);
      const intersection = [...kwSet].filter(t => pSet2.has(t)).length;
      const overlap = intersection / Math.min(kwSet.size, pSet2.size);
      if (overlap >= 0.6) {
        return { matched: true, rule: 'semantic', against: p };
      }
    }
  }
  return { matched: false, rule: null, against: null };
}

// ─── 발행 원장(ledger) ──────────────────────────────────────────────

/** 큐 ID의 기본 키워드 ID 추출: tech-01-v2 → tech-01, life-02-2026-07-30 → life-02 */
export function normalizeKeywordId(id = '') {
  return String(id)
    .replace(/-v\d+(?:-\d{4}-\d{2}-\d{2})?$/i, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .trim();
}

export async function loadPublishedLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
  try {
    const raw = await fs.readFile(ledgerPath, 'utf8');
    const data = JSON.parse(raw);
    const entries = Array.isArray(data) ? data : data.posts;
    if (!Array.isArray(entries)) throw new Error(`Invalid publication ledger: ${ledgerPath}`);
    return entries;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

export async function savePublishedLedger(entries, ledgerPath = DEFAULT_LEDGER_PATH) {
  const out = { updatedAt: new Date().toISOString(), posts: entries };
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, JSON.stringify(out, null, 2), 'utf8');
}

/** Idempotent by public URL, without hiding additional actual publications. */
export async function appendPublishedLedger(entry, ledgerPath = DEFAULT_LEDGER_PATH) {
  const entries = await loadPublishedLedger(ledgerPath);
  if (entry.url && entries.some(e => e.url === entry.url)) return entries;
  entries.push({
    id: entry.id || '',
    keyword: entry.keyword || '',
    title: entry.title || '',
    url: entry.url || '',
    category: entry.category || '',
    blogUrl: entry.blogUrl || '',
    jobId: entry.jobId || '',
    sourceBundle: entry.sourceBundle || null,
    contentTrack: entry.contentTrack || null,
    evidencePath: entry.evidencePath || null,
    publishedAt: entry.publishedAt || new Date().toISOString()
  });
  await savePublishedLedger(entries, ledgerPath);
  return entries;
}

export function isPublishedInLedger(id, ledger = []) {
  const base = normalizeKeywordId(id);
  if (!base) return null;
  return ledger.find(e => normalizeKeywordId(e.id) === base) || null;
}

// ─── 통합 판정 ──────────────────────────────────────────────────────

/**
 * 후보 글이 이미 발행되었는지 판정.
 * post: { id, keyword, title }
 * gate: { ledger, rssTitles } — buildDuplicateGate()로 생성
 */
export function isAlreadyPublished(post = {}, { ledger = [], rssTitles = [] } = {}) {
  const ledgerHit = isPublishedInLedger(post.id, ledger);
  if (ledgerHit) {
    return { matched: true, source: 'ledger', rule: 'ledger-id',
      against: ledgerHit };
  }
  const sourceUrls = newsSourceUrls(post);
  if (sourceUrls.length) {
    const candidateUrls = new Set(sourceUrls);
    const sourceHit = ledger.find(entry => newsSourceUrls(entry).some(url => candidateUrls.has(url)));
    if (sourceHit) return { matched: true, source: 'ledger', rule: 'news-source', against: sourceHit };
  }
  // Creative keywords are broad catalog categories. Compare the specific
  // tutorial title, retaining ID and title-similarity checks for repeated examples.
  const creative = post.contentTrack === 'ai-video';
  const candidate = {
    keyword: creative ? (post.title || '') : (post.keyword || post.title || ''),
    title: post.title || ''
  };
  // 원장은 RSS보다 오래된 글까지 보존한다. 과거에는 원장 ID가 작업 ID로
  // 저장됐으므로 ID 미일치가 새 주제임을 뜻하지 않는다.
  for (const entry of ledger) {
    const titles = [entry];
    if (!creative && entry.keyword && entry.keyword !== entry.title) {
      titles.push({ ...entry, title: entry.keyword });
    }
    const m = matchByTitle(candidate, titles);
    if (m.matched) return { ...m, source: 'ledger' };
  }
  if (Array.isArray(rssTitles) && rssTitles.length > 0) {
    const m = matchByTitle(candidate, rssTitles);
    if (m.matched) return { ...m, source: 'rss' };
  }
  return { matched: false, source: null, rule: null, against: null };
}

/** 원장 로드 + RSS 수집을 한 번에. RSS 실패 시 원장만으로 동작(fail-open). */
export async function buildDuplicateGate({
  blogUrl = DEFAULT_BLOG_URL,
  ledgerPath = DEFAULT_LEDGER_PATH,
  log = () => {}
} = {}) {
  const ledger = await loadPublishedLedger(ledgerPath);
  let rssTitles = [];
  try {
    rssTitles = await fetchPublishedTitles(blogUrl);
  } catch (error) {
    log(`[dup] RSS 조회 실패 — 발행 원장으로만 판정: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ledger, rssTitles };
}

// ─── 시드(초기 원장 생성) ────────────────────────────────────────────

function bestKeywordForTitle(title, keywords = []) {
  const tTokens = tokenizeTitle(title);
  if (tTokens.length === 0) return null;
  let best = null;
  let bestRatio = 0;
  for (const kw of keywords) {
    const kTokens = tokenizeTitle(kw.keyword || kw.id || '');
    if (kTokens.length === 0) continue;
    const overlap = kTokens.filter(t => tTokens.includes(t)).length;
    const ratio = overlap / kTokens.length;
    if (ratio >= 0.5 && ratio > bestRatio) {
      bestRatio = ratio;
      best = kw;
    }
  }
  return best;
}

export async function seedLedger({ blogUrl = DEFAULT_BLOG_URL, ledgerPath = DEFAULT_LEDGER_PATH, keywordsPath = '' } = {}) {
  const rssTitles = await fetchPublishedTitles(blogUrl);
  let keywords = [];
  if (keywordsPath) {
    try {
      const raw = await fs.readFile(keywordsPath, 'utf8');
      keywords = JSON.parse(raw).keywords || [];
    } catch {
      console.log(`[seed] 키워드 파일 무시: ${keywordsPath}`);
    }
  }

  const existing = await loadPublishedLedger(ledgerPath);
  const byUrl = new Map(existing.map(e => [e.url, e]));
  for (const item of rssTitles) {
    if (byUrl.has(item.url)) continue;
    const kw = bestKeywordForTitle(item.title, keywords);
    byUrl.set(item.url, {
      id: kw ? kw.id : '',
      keyword: kw ? kw.keyword : '',
      title: item.title,
      url: item.url,
      category: kw ? (kw.category || '') : '',
      blogUrl,
      publishedAt: item.pubDate || ''
    });
  }
  const entries = [...byUrl.values()];
  await savePublishedLedger(entries, ledgerPath);
  return { total: entries.length, added: entries.length - existing.length };
}

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { seed: false, blogUrl: DEFAULT_BLOG_URL, ledgerPath: DEFAULT_LEDGER_PATH, keywordsPath: '' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--seed') args.seed = true;
    else if (arg === '--ledger' && next) { args.ledgerPath = next; i++; }
    else if (arg === '--keywords' && next) { args.keywordsPath = next; i++; }
    else if (!arg.startsWith('-') && arg.includes('://')) args.blogUrl = arg;
    else if (arg === '--help') {
      console.log(`사용법: node published-posts.mjs --seed <블로그 URL> [--ledger <경로>] [--keywords <keywords.json>]`);
      process.exit(0);
    }
  }
  return args;
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('published-posts.mjs')) {
  const args = parseArgs(process.argv);
  if (!args.seed) {
    console.error('--seed 플래그가 필요하다. (--help 참고)');
    process.exit(1);
  }
  seedLedger(args)
    .then(({ total, added }) => {
      console.log(`발행 원장: 총 ${total}건 (신규 ${added}건) — ${args.ledgerPath}`);
    })
    .catch(error => {
      console.error(error.message);
      process.exit(1);
    });
}
