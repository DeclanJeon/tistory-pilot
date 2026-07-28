#!/usr/bin/env node
/**
 * market-research.mjs — 웹 경쟁 글 기반 노출/클릭 패턴 리서치
 *
 * 네이버/구글 검색 결과 제목·스니펫을 수집해
 * 사람들이 클릭할 법한 제목 패턴, 의도, 콘텐츠 형식을 추정한다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const MEMORY_DIR = path.join(PROJECT_ROOT, 'content', 'learning');
const MEMORY_PATH = path.join(MEMORY_DIR, 'market-memory.json');
const CACHE_DIR = path.join(MEMORY_DIR, 'cache');

const TITLE_HOOKS = [
  { code: 'year', re: /20\d{2}/, label: '연도 포함' },
  { code: 'number', re: /\d+\s*(가지|선|곳|개|만원|원|%|위)/, label: '숫자/리스트' },
  { code: 'guide', re: /가이드|총정리|완벽|한눈에|정리|방법|하는 법/, label: '가이드형' },
  { code: 'compare', re: /비교|vs|versus|추천|랭킹|순위/, label: '비교/추천' },
  { code: 'calc', re: /계산|계산기|산정|공식|세액|공제|한도/, label: '계산/절세' },
  { code: 'howto', re: /신청|사용법|설치|설정|초보|입문/, label: '하우투' },
  { code: 'benefit', re: /절약|아끼|혜택|무료|지원금|보조금/, label: '혜택/이득' },
  { code: 'urgency', re: /지금|즉시|필수|꼭|주의|마감/, label: '긴급성' }
];

const INTENT_RULES = [
  { intent: 'transactional', re: /신청|가입|구매|렌탈|대출|지원금|보조금|요금제/, cpcBias: 'S' },
  { intent: 'commercial', re: /추천|비교|순위|베스트|후기|리뷰/, cpcBias: 'A' },
  { intent: 'informational', re: /방법|가이드|뜻|이란|계산|총정리|사용법/, cpcBias: 'B' }
];

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/새 창 열림/g, ' ')
    .replace(/블로그\s*\d+만\s*인용/g, ' ')
    .replace(/카페\s*\d+만\s*인용/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function decodeBasicEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractNaverResults(html) {
  const results = [];
  let m;

  // Preferred: explicit title classes
  const titleRe = /<a[^>]*class="[^"]*(?:title_link|api_txt_lines total_tit|total_tit|sh_blog_title|title)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = titleRe.exec(html)) && results.length < 12) {
    const url = decodeBasicEntities(m[1]);
    const title = cleanTitle(stripTags(m[2]));
    if (!title || title.length < 8 || title.length > 80) continue;
    if (/naver\.com\/(theme|newsstand|nidlogin)/i.test(url)) continue;
    if (/(새 창|로그인|더보기|블로그입니다|카페입니다)/.test(title)) continue;
    results.push({ title, url, source: 'naver' });
  }

  // JSON-ish embedded titles sometimes present
  if (results.length < 5) {
    const jsonTitleRe = /"title"\s*:\s*"([^"]{8,80})"/g;
    while ((m = jsonTitleRe.exec(html)) && results.length < 12) {
      const title = cleanTitle(stripTags(m[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))));
      if (!title || /(새 창|로그인|더보기|블로그입니다)/.test(title)) continue;
      results.push({ title, url: '', source: 'naver-json' });
    }
  }

  // fallback: blog/cafe/tistory anchors only
  if (results.length < 5) {
    const altRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = altRe.exec(html)) && results.length < 12) {
      const url = decodeBasicEntities(m[1]);
      const title = cleanTitle(stripTags(m[2]));
      if (!title || title.length < 12 || title.length > 70) continue;
      if (!/(blog\.naver\.com|cafe\.naver\.com|tistory\.com|post\.naver\.com|news)/i.test(url)) continue;
      if (/(새 창|로그인|더보기|인용|블로그입니다|프로필)/.test(title)) continue;
      if (/^(http|www\.)/i.test(title)) continue;
      results.push({ title, url, source: 'naver-fallback' });
    }
  }
  return uniqueBy(results, r => r.title);
}

function extractGoogleResults(html) {
  const results = [];
  // Google often includes result blocks; use broad title extraction.
  const patterns = [
    /<h3[^>]*>([\s\S]*?)<\/h3>/gi,
    /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) && results.length < 12) {
      if (re === patterns[0]) {
        const title = stripTags(m[1]);
        if (title && title.length >= 8 && title.length <= 90) {
          results.push({ title, url: '', source: 'google' });
        }
      } else {
        const url = decodeURIComponent(m[1]);
        const title = stripTags(m[2]);
        if (title && title.length >= 8) results.push({ title, url, source: 'google' });
      }
    }
  }
  return uniqueBy(results, r => r.title);
}

function detectHooks(title) {
  return TITLE_HOOKS.filter(h => h.re.test(title)).map(h => h.code);
}

function detectIntent(text) {
  for (const rule of INTENT_RULES) {
    if (rule.re.test(text)) return rule;
  }
  return { intent: 'informational', cpcBias: 'B' };
}

function estimateCpcTier(keyword, intent, category = '') {
  const text = `${keyword} ${category}`;
  if (/대출|보험|카드|학원|렌탈|지원금|보조금|세액|공제|신용/.test(text)) return 'S';
  if (intent === 'transactional') return 'S';
  if (intent === 'commercial' || /추천|비교|요금|계산/.test(text)) return 'A';
  if (/AI|코딩|Docker|가이드|사용법/.test(text)) return 'B';
  return intent === 'informational' ? 'B' : 'A';
}

function scoreTitleAgainstMarket(title, market) {
  const failures = [];
  const warnings = [];
  const suggestions = [];
  const hooks = detectHooks(title);
  const titleLen = [...title].length;

  if (titleLen < 18) failures.push({ code: 'title-too-short-seo', message: `제목이 짧다 (${titleLen}자). 검색 클릭용으로 18자 이상 권장.` });
  if (titleLen > 48) warnings.push({ code: 'title-too-long', message: `제목이 길다 (${titleLen}자). 48자 이내 권장.` });

  if (market.topHooks?.length) {
    const overlap = hooks.filter(h => market.topHooks.includes(h));
    if (overlap.length === 0) {
      warnings.push({
        code: 'title-hook-missing',
        message: `상위 글 공통 훅(${market.topHookLabels.join(', ')})이 제목에 없다.`
      });
      suggestions.push(`제목에 다음 요소 중 2개 이상 포함: ${market.topHookLabels.join(', ')}`);
    }
  }

  if (market.commonTokens?.length) {
    const hit = market.commonTokens.filter(tok => title.includes(tok)).length;
    if (hit < 1) {
      warnings.push({
        code: 'title-token-weak',
        message: `상위 노출 토큰이 제목에 약하다. 예: ${market.commonTokens.slice(0, 5).join(', ')}`
      });
      suggestions.push(`제목/도입에 고노출 토큰 반영: ${market.commonTokens.slice(0, 6).join(', ')}`);
    }
  }

  // Click pattern heuristics
  if (!/(가이드|총정리|비교|추천|방법|계산|신청|사용법)/.test(title)) {
    suggestions.push('클릭률 높은 패턴: "총정리/비교/방법/계산/신청" 중 하나를 제목에 명시');
  }
  if (market.intent === 'commercial' && !/(비교|추천|순위|vs)/.test(title)) {
    warnings.push({ code: 'intent-title-mismatch', message: '상업 의도 키워드인데 비교/추천형 제목이 아니다.' });
  }
  if (market.intent === 'transactional' && !/(신청|자격|지원|방법|한도)/.test(title)) {
    warnings.push({ code: 'intent-title-mismatch', message: '거래 의도 키워드인데 신청/자격/한도 정보가 제목에 없다.' });
  }

  return { hooks, titleLen, failures, warnings, suggestions };
}

function scoreBodyAgainstMarket(html, plain, market) {
  const failures = [];
  const warnings = [];
  const suggestions = [];

  if (market.intent === 'commercial' && !/<table/i.test(html)) {
    failures.push({ code: 'market-needs-table', message: '비교/추천 의도 키워드인데 비교 테이블이 없다.' });
    suggestions.push('상위 노출 글처럼 비교표를 넣고 장단점/가격/조건을 표로 정리');
  }
  if (market.intent === 'transactional' && !/(신청|자격|한도|서류|절차|조건)/.test(plain)) {
    failures.push({ code: 'market-needs-steps', message: '신청/지원 의도인데 자격·절차·한도 설명이 부족하다.' });
    suggestions.push('신청 자격, 필요 서류, 단계별 절차, 주의사항을 섹션으로 분리');
  }
  if (market.intent === 'informational' && plain.length < 2200) {
    warnings.push({ code: 'market-thin-info', message: '정보성 키워드는 더 두꺼운 설명이 상위 노출에 유리하다.' });
  }
  if (market.commonTokens?.length) {
    const covered = market.commonTokens.filter(tok => plain.includes(tok) || html.includes(tok));
    if (covered.length < Math.min(3, market.commonTokens.length)) {
      warnings.push({
        code: 'market-token-coverage',
        message: `본문 토큰 커버리지 부족 (${covered.length}/${Math.min(3, market.commonTokens.length)}).`
      });
      suggestions.push(`본문에 반복 노출 키워드 보강: ${market.commonTokens.slice(0, 8).join(', ')}`);
    }
  }
  // CTR body openers: first 120 chars should include keyword-ish token
  const opener = plain.slice(0, 120);
  if (market.keyword && !opener.includes(market.keyword) && !market.keyword.split(/\s+/).some(t => t.length >= 2 && opener.includes(t))) {
    warnings.push({ code: 'weak-opener', message: '도입 120자 안에 핵심 키워드가 약하다. 클릭 후 체류에 불리하다.' });
    suggestions.push('첫 문단에 검색 키워드를 자연스럽게 배치');
  }

  return { failures, warnings, suggestions };
}

function tokenizeKorean(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !['있는', '없는', '하는', '위해', '그리고', '대한', '통해', '부터', '까지', 'https', 'com', 'www'].includes(t));
}

async function loadMemory() {
  try {
    return JSON.parse(await fs.readFile(MEMORY_PATH, 'utf8'));
  } catch {
    return { version: 1, updatedAt: null, keywords: {}, patterns: { titleHooks: {}, intents: {} } };
  }
}

async function saveMemory(memory) {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  memory.updatedAt = new Date().toISOString();
  await fs.writeFile(MEMORY_PATH, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
}

async function fetchSearchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8'
    }
  });
  if (!res.ok) throw new Error(`search fetch failed ${res.status}`);
  return res.text();
}

export async function researchKeywordMarket(keyword, options = {}) {
  const key = String(keyword || '').trim();
  if (!key) {
    return {
      keyword: '',
      sampleCount: 0,
      intent: 'informational',
      cpcTier: 'B',
      topHooks: [],
      topHookLabels: [],
      commonTokens: [],
      competitors: [],
      recommendations: ['키워드가 비어 있다.']
    };
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheKey = key.replace(/[^\w가-힣]+/g, '_').slice(0, 80);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  const cacheTtlMs = Number(options.cacheTtlMs || 1000 * 60 * 60 * 12);

  if (!options.force) {
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      if (cached?.researchedAt && Date.now() - new Date(cached.researchedAt).getTime() < cacheTtlMs) {
        return cached;
      }
    } catch {
      // miss
    }
  }

  const competitors = [];
  const errors = [];

  // Naver search
  try {
    const naverUrl = `https://search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodeURIComponent(key)}`;
    const html = await fetchSearchHtml(naverUrl);
    competitors.push(...extractNaverResults(html));
  } catch (error) {
    errors.push(`naver:${error instanceof Error ? error.message : String(error)}`);
  }

  // Google search (best effort)
  try {
    const googleUrl = `https://www.google.com/search?hl=ko&gl=kr&q=${encodeURIComponent(key)}&num=10`;
    const html = await fetchSearchHtml(googleUrl);
    competitors.push(...extractGoogleResults(html));
  } catch (error) {
    errors.push(`google:${error instanceof Error ? error.message : String(error)}`);
  }

  // Optional deeper fetch of top 2 pages for body cues (no extra deps)
  const deepSamples = [];
  for (const item of competitors.slice(0, 2)) {
    if (!item.url || !/^https?:\/\//i.test(item.url)) continue;
    try {
      const html = await fetchSearchHtml(item.url);
      const text = stripTags(html);
      deepSamples.push({
        url: item.url,
        title: item.title,
        plainChars: text.length,
        hasTable: /<table/i.test(html || ''),
        tokens: tokenizeKorean(text).slice(0, 30)
      });
    } catch {
      // ignore deep fetch failures
    }
  }

  const uniq = uniqueBy(competitors, r => r.title).slice(0, 10);
  const hookCount = {};
  const tokenCount = {};
  for (const item of uniq) {
    for (const h of detectHooks(item.title)) hookCount[h] = (hookCount[h] || 0) + 1;
    for (const tok of tokenizeKorean(item.title)) tokenCount[tok] = (tokenCount[tok] || 0) + 1;
  }
  for (const deep of deepSamples) {
    for (const tok of deep.tokens || []) tokenCount[tok] = (tokenCount[tok] || 0) + 1;
  }

  const topHooks = Object.entries(hookCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code]) => code);
  const topHookLabels = topHooks.map(code => TITLE_HOOKS.find(h => h.code === code)?.label || code);
  const commonTokens = Object.entries(tokenCount)
    .sort((a, b) => b[1] - a[1])
    .map(([tok]) => tok)
    .filter(tok => tok !== key && !key.includes(tok) || tok.length >= 2)
    .filter(tok => !key.split(/\s+/).includes(tok))
    .filter(tok => !['열림','블로그','카페','인용','새창','제공하는','정보를','관련','다양한','블로그입니다','카페입니다','프로필','새','창','열림',' bo노','지델롱'].includes(tok))
    .slice(0, 12);

  const intentInfo = detectIntent(`${key} ${uniq.map(u => u.title).join(' ')}`);
  const cpcTier = estimateCpcTier(key, intentInfo.intent, options.category || '');
  const avgTitleLength = uniq.length
    ? Math.round(uniq.reduce((sum, u) => sum + [...u.title].length, 0) / uniq.length)
    : 0;

  const recommendations = [];
  if (topHookLabels.length) recommendations.push(`상위 노출 제목 훅: ${topHookLabels.join(', ')}`);
  if (commonTokens.length) recommendations.push(`반복 노출 토큰: ${commonTokens.slice(0, 8).join(', ')}`);
  if (intentInfo.intent === 'commercial') recommendations.push('비교표 + 추천 기준 + 한줄 결론 구조를 상단에 배치');
  if (intentInfo.intent === 'transactional') recommendations.push('자격/한도/신청 절차를 초반 2개 섹션 안에 배치');
  if (intentInfo.intent === 'informational') recommendations.push('정의 → 예시 → 실수 방지 → 체크리스트 순으로 구성');
  recommendations.push(`추정 CPC 티어: ${cpcTier} / 검색 의도: ${intentInfo.intent}`);

  const market = {
    keyword: key,
    researchedAt: new Date().toISOString(),
    sampleCount: uniq.length,
    intent: intentInfo.intent,
    cpcTier,
    avgTitleLength,
    topHooks,
    topHookLabels,
    commonTokens,
    competitors: uniq,
    deepSamples,
    recommendations,
    errors
  };

  await fs.writeFile(cachePath, `${JSON.stringify(market, null, 2)}\n`, 'utf8');

  // update durable memory
  const memory = await loadMemory();
  memory.keywords[key] = {
    updatedAt: market.researchedAt,
    intent: market.intent,
    cpcTier: market.cpcTier,
    topHooks: market.topHooks,
    commonTokens: market.commonTokens,
    avgTitleLength: market.avgTitleLength,
    sampleCount: market.sampleCount
  };
  for (const h of market.topHooks) {
    memory.patterns.titleHooks[h] = (memory.patterns.titleHooks[h] || 0) + 1;
  }
  memory.patterns.intents[market.intent] = (memory.patterns.intents[market.intent] || 0) + 1;
  await saveMemory(memory);

  return market;
}

export function evaluateAgainstMarket({ title, html, plain, keyword, category }, market) {
  if (!market || !market.sampleCount) {
    return {
      failures: [],
      warnings: [{ code: 'market-research-empty', message: '웹 리서치 결과가 부족해 시장 QA를 약하게 적용했다.' }],
      suggestions: ['검색 결과 수집이 실패했을 수 있다. 네트워크/차단 여부를 확인하라.'],
      scoreDelta: -4
    };
  }

  const titleEval = scoreTitleAgainstMarket(title || '', market);
  const bodyEval = scoreBodyAgainstMarket(html || '', plain || '', market);
  const failures = [...titleEval.failures, ...bodyEval.failures];
  const warnings = [...titleEval.warnings, ...bodyEval.warnings];
  const suggestions = [...titleEval.suggestions, ...bodyEval.suggestions, ...(market.recommendations || [])];

  // learn soft preference: if memory says year/number hooks win often, reinforce
  return {
    failures,
    warnings,
    suggestions: uniqueBy(suggestions.map(s => ({ s })), x => x.s).map(x => x.s),
    scoreDelta: -(failures.length * 12 + warnings.length * 3),
    titleHooks: titleEval.hooks,
    market
  };
}

export async function recordPublishFeedback({
  keyword = '',
  title = '',
  status = 'succeeded',
  qaScore = null,
  plainChars = null,
  category = ''
} = {}) {
  const memory = await loadMemory();
  if (!memory.feedback) memory.feedback = [];
  memory.feedback.push({
    at: new Date().toISOString(),
    keyword,
    title,
    status,
    qaScore,
    plainChars,
    category
  });
  // keep last 300
  memory.feedback = memory.feedback.slice(-300);

  if (status === 'succeeded' && title) {
    for (const h of detectHooks(title)) {
      memory.patterns.titleHooks[h] = (memory.patterns.titleHooks[h] || 0) + 1;
    }
  }
  await saveMemory(memory);
  return memory;
}

export function buildMarketPromptBlock(market) {
  if (!market) return '';
  const lines = [
    '[시장 리서치 결과 — 발행 전 반드시 반영]',
    `키워드: ${market.keyword}`,
    `검색 의도: ${market.intent}`,
    `추정 CPC 티어: ${market.cpcTier}`,
    `상위 글 샘플: ${market.sampleCount}건`,
    `평균 제목 길이: ${market.avgTitleLength || '-'}자`,
    `먹히는 제목 훅: ${(market.topHookLabels || []).join(', ') || '-'}`,
    `고노출 토큰: ${(market.commonTokens || []).slice(0, 10).join(', ') || '-'}`,
    '상위 경쟁 제목:'
  ];
  for (const c of (market.competitors || []).slice(0, 6)) {
    lines.push(`- ${c.title}`);
  }
  lines.push('작성 지시:');
  for (const r of (market.recommendations || []).slice(0, 6)) lines.push(`- ${r}`);
  lines.push('[/시장 리서치 결과]');
  return lines.join('\n');
}


// CLI
const isCli = process.argv[1] && (process.argv[1].endsWith('market-research.mjs'));
if (isCli) {
  const keyword = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ') || process.argv[2];
  if (!keyword || keyword.startsWith('--')) {
    console.error('사용법: node scripts/content/market-research.mjs "키워드"');
    process.exit(1);
  }
  researchKeywordMarket(keyword, { force: process.argv.includes('--force') })
    .then(market => {
      console.log(JSON.stringify(market, null, 2));
    })
    .catch(err => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
