#!/usr/bin/env node
/**
 * news-discovery.mjs — P2P 기술 뉴스 이슈 발굴
 *
 * 흐름: Naver News + Google News 수집 → P2P 금융 필터 → 7일 윈도우 →
 * 이슈 클러스터 → 스코어링 → keywords.json에 news 엔트리 등록.
 *
 * 뉴스 엔트리는 expiresAt(발견일+7일)을 가진다 — 소모성 이슈라
 * 만료되면 select-keywords에서 제외된다.
 *
 * 사용법:
 *   node scripts/content/news-discovery.mjs --date 2026-09-14 --cap 3 --apply
 *   node scripts/content/news-discovery.mjs --date 2026-09-14 --cap 5 --topic both --category "AI·P2P" --apply
 *   node scripts/content/news-discovery.mjs --dry-run
 *
 * 플래그:
 *   --topic p2p|both   P2P 쿼리만 (기본) / P2P+AI 쿼리 합산 + AI 관련성 허용
 *   --category <이름>   등록 카테고리 (기본 IT·테크, AI·P2P 트랙은 "AI·P2P")
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchNaverNews } from './sources/naver-news.mjs';
import { fetchGoogleNews } from './sources/google-news-rss.mjs';
import { tokenizeTitle, matchByTitle, buildDuplicateGate, isAlreadyPublished, canonicalSourceUrl } from '../lib/published-posts.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');
const REPORT_DIR = path.join(PROJECT_ROOT, 'content', 'learning');
const PUBLISHED_LEDGER_PATH = path.join(PROJECT_ROOT, 'content', 'published.json');
const WINDOW_DAYS = 7;
const EXPIRY_DAYS = 7;

// P2P 네트워크 기술 쿼리 — 한국어는 Naver, 영어는 Google News.
const NAVER_QUERIES = ['P2P 기술', 'P2P 네트워크', '분산 네트워크', 'WebRTC', '분산 스토리지'];
const GOOGLE_QUERIES = ['peer-to-peer technology', 'WebRTC', 'IPFS', 'BitTorrent', 'decentralized network', 'libp2p', 'P2P protocol'];

// AI·P2P 트랙용 AI 쿼리 — topic=both일 때 P2P 쿼리와 합쳐 수집한다.
const NAVER_AI_QUERIES = ['AI 에이전트', '생성형 AI', 'AI 규제', '오픈소스 LLM', 'AI 모델'];
const GOOGLE_AI_QUERIES = ['AI agents', 'open source LLM', 'AI regulation', 'AI model release', 'multimodal AI'];

// P2P 금융 오염 차단 — 금융어만 있고 기술어가 없으면 제외.
const FINANCE_RE = /대출|투자|온투업|온라인투자연계|금융|연체|부실|수익률|펀딩|채권|상환|렌딧|8퍼센트|피플펀드|테라펀딩|어니스트펀드/i;
// 암호화폐 시세·거래소 기사 — 명시 기술 쿼리 면제와 무관하게 무조건 제외
// (2026-09-27 'decentralized network' 쿼리로 USDT·비트코인 기사 3건 유출 재발 방지)
const CRYPTO_NOISE_RE = /비트코인|이더리움|USDT|USDC|시세|거래소|상장|출금|입금|매수|매도|디지털자산|가상자산|암호화폐|시가총액|도미넌스|호가|업비트|빗썸|바이낸스|FTX|리플|솔라나|도지코인|위믹스|코인/i;
const TECH_RE = /프로토콜|네트워크|노드|분산|WebRTC|토렌트|BitTorrent|블록체인|IPFS|libp2p|피어|peer|DHT|시딩|스웜|swarm|메시|mesh|NAT|시그널링|signaling|데이터 채널|datachannel|분산 스토리지|탈중앙|decentralized/i;
// 명시 기술 쿼리로 온 기사는 금융 필터 면제
const EXPLICIT_TECH_QUERY_RE = /webrtc|ipfs|bittorrent|libp2p|분산|decentralized|peer-to-peer/i;

function parseArgs(argv) {
  const args = { date: '', cap: 3, apply: false, dryRun: false, windowDays: WINDOW_DAYS, topic: 'p2p', category: 'IT·테크' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]; const next = argv[i + 1];
    if (arg === '--date' && next) { args.date = next; i++; }
    else if (arg === '--cap' && next) { args.cap = Number.parseInt(next, 10) || 3; i++; }
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--window-days' && next) { args.windowDays = Number.parseInt(next, 10) || WINDOW_DAYS; i++; }
    else if (arg === '--topic' && next) { args.topic = next === 'both' ? 'both' : 'p2p'; i++; }
    else if (arg === '--category' && next) { args.category = next; i++; }
  }
  if (!args.date) args.date = new Date().toISOString().slice(0, 10);
  return args;
}

function articleFromItem(item, query, source) {
  return {
    title: item.raw,
    url: item.url || '',
    source,
    outlet: item.metrics?.outlet || null,
    pubDate: item.metrics?.pubDate || item.metrics?.checkedAt || null,
    description: item.metrics?.description || '',
    query
  };
}

function isFinanceNoise(article) {
  const text = `${article.title} ${article.description}`;
  // 암호화폐 시세·거래소 기사는 명시 기술 쿼리로 와도 무조건 제외
  if (CRYPTO_NOISE_RE.test(text)) return true;
  // 명시 기술 쿼리로 온 기사는 금융 필터 면제
  if (EXPLICIT_TECH_QUERY_RE.test(article.query)) return false;
  return FINANCE_RE.test(text) && !TECH_RE.test(text);
}

function withinWindow(article, now, windowDays) {
  const t = Date.parse(article.pubDate || '');
  if (!Number.isFinite(t)) return true; // 날짜 없으면 보수적으로 유지
  return (now.getTime() - t) <= windowDays * 24 * 60 * 60 * 1000;
}

function titleTokens(title) {
  return new Set(tokenizeTitle(title));
}

// P2P 기술 관련성 — 기사가 실제로 P2P/분산 네트워크를 다루는지 확인한다.
// "P2P 기술" 쿼리 결과에도 무관한 기사가 섞이므로 양성 필터가 필요하다.
const P2P_RELEVANCE_RE = /P2P|peer.?to.?peer|WebRTC|IPFS|BitTorrent|토렌트|libp2p|분산 네트워크|분산 스토리지|탈중앙|decentralized|DHT|시딩|스웜|swarm|메시 네트워크|mesh network|NAT traversal|시그널링|signaling|데이터 채널|datachannel|블록체인 노드|분산 원장/i;

function isP2pRelevant(article) {
  const text = `${article.title} ${article.description}`;
  return P2P_RELEVANCE_RE.test(text);
}

// AI 관련성 — topic=both(AI·P2P 트랙)에서 P2P와 무관한 AI 기사도 선정하기 위한 양성 필터.
const AI_RELEVANCE_RE = /\bAI\b|인공지능|ChatGPT|OpenAI|Anthropic|Claude|Gemini|LLM|GPT|생성형|머신러닝|딥러닝|에이전트|Copilot|Sora|Llama|Grok|xAI|agentic/i;

function isAiRelevant(article) {
  const text = `${article.title} ${article.description}`;
  return AI_RELEVANCE_RE.test(text);
}


function overlapCoeff(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * 같은 사건을 다룬 기사를 이슈로 묶는다 — 제목 토큰 overlap ≥ 0.5.
 */
export function clusterArticles(articles, threshold = 0.5) {
  const clusters = [];
  for (const article of articles) {
    const tokens = titleTokens(article.title);
    let best = null; let bestScore = 0;
    for (const c of clusters) {
      const score = overlapCoeff(tokens, c.tokens);
      if (score >= threshold && score > bestScore) { best = c; bestScore = score; }
    }
    if (best) {
      best.articles.push(article);
      for (const t of tokens) best.tokens.add(t);
    } else {
      clusters.push({ tokens, articles: [article] });
    }
  }
  return clusters;
}

function issueScore(cluster, now) {
  const sources = new Set(cluster.articles.map(a => a.source));
  const outlets = new Set(cluster.articles.map(a => a.outlet).filter(Boolean));
  const latest = Math.max(...cluster.articles.map(a => Date.parse(a.pubDate || '') || 0));
  const ageDays = latest ? (now.getTime() - latest) / (24 * 60 * 60 * 1000) : 7;
  const freshness = Math.max(0, 10 - Math.round(ageDays * 1.5));
  const techHits = cluster.articles.filter(a => TECH_RE.test(`${a.title} ${a.description}`)).length;
  return {
    score: cluster.articles.length * 3 + sources.size * 2 + outlets.size + freshness + techHits * 2,
    articleCount: cluster.articles.length,
    sourceCount: sources.size,
    outletCount: outlets.size,
    freshness,
    techHits
  };
}

function issueTitle(cluster) {
  // 가장 최신 기사 제목을 대표로 — <b> 태그는 adapter에서 이미 제거됨
  const sorted = [...cluster.articles].sort((a, b) => (Date.parse(b.pubDate || '') || 0) - (Date.parse(a.pubDate || '') || 0));
  return sorted[0].title;
}

async function fetchArticleExcerpt(url, { maxChars = 2000, timeoutMs = 8000 } = {}) {
  if (!url || !/^https?:/.test(url)) return '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; tistory-pilot/1.0)' }
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const html = await res.text();
    const text = html
      .replace(/<(script|style|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, maxChars);
  } catch {
    return '';
  }
}

function buildNewsRecord(issue, date, sequence, now, category = 'IT·테크') {
  const dateCompact = date.replace(/-/g, '');
  const expires = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const isAiP2p = category === 'AI·P2P';
  const articles = issue.articles.map(a => ({
    title: a.title,
    url: a.url,
    source: a.source,
    outlet: a.outlet,
    pubDate: a.pubDate,
    excerpt: a.excerpt || a.description || ''
  }));
  return {
    id: `news-${dateCompact}-${String(sequence).padStart(2, '0')}`,
    keyword: issue.title,
    category,
    contentType: 'info',
    tags: isAiP2p ? ['AI', 'P2P', '뉴스'] : ['P2P', '기술', '뉴스'],
    description: `${isAiP2p ? 'AI·P2P' : 'P2P 기술'} 뉴스 이슈 — ${issue.articles.length}건 기사 (${issue.sourceCount}개 소스)`,
    metrics: { monthlySearch: 0, cpcKrw: 0, source: 'news-discovery', checkedAt: now.toISOString() },
    score: { intent: 4, bid: 0, volume: 0, gap: 0, source: 8, durability: 4, total: 40 },
    gap: { total: 0, rawTotal: 0 },
    ymylRisk: 'none',
    commercialIntent: 4,
    enabled: true,
    ymylDomain: '',
    expiresAt: expires,
    news: {
      issue: issue.title,
      articleCount: articles.length,
      articles
    },
    source: 'news-discovery',
    researchedAt: now.toISOString()
  };
}

export async function discoverNewsIssues({
  date = new Date().toISOString().slice(0, 10),
  cap = 3,
  windowDays = WINDOW_DAYS,
  apply = false,
  topic = 'p2p',
  category = 'IT·테크',
  env = process.env,
  fetchNaverImpl = fetchNaverNews,
  fetchGoogleImpl = fetchGoogleNews,
  fetchArticleImpl = fetchArticleExcerpt,
  keywordsPath = KEYWORDS_PATH,
  publishedLedgerPath = PUBLISHED_LEDGER_PATH,
  duplicateGate = null,
  now = new Date()
} = {}) {
  const errors = [];
  const collected = [];

  // 1. 수집 — topic=both(AI·P2P 트랙)는 P2P + AI 쿼리 합산
  const naverQueries = topic === 'both' ? [...NAVER_QUERIES, ...NAVER_AI_QUERIES] : NAVER_QUERIES;
  const googleQueries = topic === 'both' ? [...GOOGLE_QUERIES, ...GOOGLE_AI_QUERIES] : GOOGLE_QUERIES;
  for (const q of naverQueries) {
    const r = await fetchNaverImpl({ env, query: q, display: 30, sort: 'date' });
    if (r.error) errors.push(`naver-news(${q}): ${r.error}`);
    for (const item of r.items || []) collected.push(articleFromItem(item, q, 'naver-news'));
  }
  for (const q of googleQueries) {
    const r = await fetchGoogleImpl({ query: q, display: 20 });
    if (r.error) errors.push(`google-news(${q}): ${r.error}`);
    for (const item of r.items || []) collected.push(articleFromItem(item, q, 'google-news'));
  }

  // 2. 필터: canonical URL dedup → 관련성(P2P 또는 AI) → 금융/암호화폐 노이즈 → 7일 윈도우
  //    canonicalSourceUrl은 의미 있는 쿼리(idxno 등)를 보존하므로 같은 언론사의
  //    서로 다른 기사가 쿼리 제거로 합쳐지지 않는다.
  const seenUrls = new Set();
  const filtered = [];
  const rejected = { irrelevant: 0, finance: 0, stale: 0, dup: 0, published: 0, sourceDup: 0 };
  for (const a of collected) {
    const urlKey = a.url ? (canonicalSourceUrl(a.url) || `url:${a.url}`) : `title:${a.title}`;
    if (seenUrls.has(urlKey)) { rejected.dup++; continue; }
    seenUrls.add(urlKey);
    const relevant = topic === 'both' ? (isP2pRelevant(a) || isAiRelevant(a)) : isP2pRelevant(a);
    if (!relevant) { rejected.irrelevant++; continue; }
    if (isFinanceNoise(a)) { rejected.finance++; continue; }
    if (!withinWindow(a, now, windowDays)) { rejected.stale++; continue; }
    filtered.push(a);
  }

  // 3. 클러스터 → 스코어링
  const clusters = clusterArticles(filtered);
  const scored = clusters.map(c => ({ cluster: c, ...issueScore(c, now), title: issueTitle(c) }));
  scored.sort((a, b) => b.score - a.score);

  // 4. 발행 이력 + 기존 키워드와 중복 차단
  const data = JSON.parse(await fs.readFile(keywordsPath, 'utf8'));
  const existing = Array.isArray(data.keywords) ? data.keywords : [];
  const publishedTitles = existing
    .filter(k => k.news)
    .map(k => ({ title: k.keyword }));
  // 실제 발행 원장/RSS 게이트 — RSS 실패 시 원장만으로 판정(fail-open).
  const gate = duplicateGate || await buildDuplicateGate({ blogUrl: 'https://acstory.tistory.com', ledgerPath: publishedLedgerPath, log: () => {} });
  // 기존 키워드의 news.articles URL은 이미 다룬 기사 이력으로 간주한다.
  const usedSourceUrls = new Set();
  for (const k of existing) {
    for (const a of k.news?.articles || []) {
      const canon = canonicalSourceUrl(a.url || '');
      if (canon) usedSourceUrls.add(canon);
    }
  }

  const selected = [];
  for (const s of scored) {
    if (selected.length >= cap) break;
    const candidate = { id: `news-candidate-${s.title}`, keyword: s.title, title: s.title, news: { articles: s.cluster.articles } };
    // 발행 원장/RSS에 이미 있는 주제/기사 소스는 스킵
    const published = isAlreadyPublished(candidate, gate);
    if (published.matched) { rejected.published++; continue; }
    const dup = matchByTitle({ keyword: s.title }, publishedTitles);
    if (dup.matched) { rejected.published++; continue; }
    // 기존 일반 키워드와도 겹치면 스킵 (같은 주제 재발행 방지)
    const kwDup = matchByTitle({ keyword: s.title }, existing.filter(k => !k.news).map(k => ({ title: k.keyword })));
    if (kwDup.matched) { rejected.published++; continue; }
    // 같은 실행 안에서 이미 다룬 기사 소스 URL을 재사용하는 이슈는 스킵.
    // 언론사(outlet)가 같다는 이유만으로는 차단하지 않는다 — idxno가 다른 별개 기사는 허용.
    const articleUrls = s.cluster.articles
      .map(a => canonicalSourceUrl(a.url || ''))
      .filter(Boolean);
    if (articleUrls.some(u => usedSourceUrls.has(u))) { rejected.sourceDup++; continue; }
    for (const u of articleUrls) usedSourceUrls.add(u);
    selected.push(s);
    // 같은 실행 안에서 선정된 이슈 제목도 이력에 추가 — 소스가 다른 같은 주제의 중복 선정 방지
    publishedTitles.push({ title: s.title });
  }

  // 5. 기사 본문 수집 (선정된 이슈만, best-effort)
  for (const s of selected) {
    for (const a of s.cluster.articles.slice(0, 4)) {
      a.excerpt = await fetchArticleImpl(a.url);
    }
  }

  // 6. keywords.json 등록
  let appended = [];
  if (apply && selected.length) {
    const usedIds = new Set(existing.map(k => k.id));
    let seq = 1;
    for (const s of selected) {
      let record;
      do {
        record = buildNewsRecord({ title: s.title, articles: s.cluster.articles, sourceCount: s.sourceCount }, date, seq++, now, category);
      } while (usedIds.has(record.id));
      usedIds.add(record.id);
      existing.push(record);
      appended.push(record);
    }
    data.keywords = existing;
    data.updatedAt = now.toISOString().slice(0, 10);
    await fs.writeFile(keywordsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  const report = {
    date,
    topic,
    category,
    collected: collected.length,
    filtered: filtered.length,
    rejected,
    clusters: clusters.length,
    selected: selected.map(s => ({ title: s.title, score: s.score, articles: s.cluster.articles.length, sources: s.sourceCount })),
    errors,
    applied: appended.length
  };
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const reportSuffix = category === 'AI·P2P' ? '-aip2p' : '';
  await fs.writeFile(path.join(REPORT_DIR, `news-discovery-${date}${reportSuffix}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { report, appended };
}

const isCli = process.argv[1] && (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')) || process.argv[1].endsWith('news-discovery.mjs'));
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  discoverNewsIssues({ date: args.date, cap: args.cap, windowDays: args.windowDays, apply: args.apply && !args.dryRun, topic: args.topic, category: args.category })
    .then(({ report, appended }) => {
      console.log(`[news-discovery] topic=${report.topic} category=${report.category} 수집 ${report.collected}건 → 필터 ${report.filtered}건 (금융 ${report.rejected.finance}, 만료 ${report.rejected.stale}, 중복 ${report.rejected.dup}) → 클러스터 ${report.clusters} → 선정 ${report.selected.length}`);
      for (const s of report.selected) console.log(`  ✓ ${s.title} [기사 ${s.articles}건, 소스 ${s.sources}, 점수 ${s.score}]`);
      if (report.errors.length) for (const e of report.errors) console.log(`  [warn] ${e}`);
      console.log(args.apply && !args.dryRun ? `[news-discovery] keywords.json 등록: ${appended.length}건` : '[news-discovery] dry-run — keywords.json 변경 없음');
    })
    .catch(error => { console.error(error.message); process.exit(1); });
}
