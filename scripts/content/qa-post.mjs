#!/usr/bin/env node
/**
 * qa-post.mjs — tistory-blog 스킬 기준 발행 전 QA
 *
 * 사용법:
 *   node scripts/content/qa-post.mjs --file content/generated/2026-07-28/xxx.html
 *   node scripts/content/qa-post.mjs --dir content/generated/2026-07-28
 *   node scripts/content/qa-post.mjs --meta content/generated/2026-07-28/xxx.meta.json
 *
 * 다른 스크립트에서:
 *   import { qaHtmlPost, qaMetaPost, writeQaReport } from './qa-post.mjs'
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { researchKeywordMarket, evaluateAgainstMarket } from './market-research.mjs';
import { notifyQaResult } from '../lib/discord-notify.mjs';
import { YMYL_DENIED_PATTERNS } from './keyword-score.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SKILL_CANDIDATES = [
  path.join(PROJECT_ROOT, '.codex/skills/tistory-blog/SKILL.md'),
  path.join(process.env.HOME || '/home/declan', '.codex/skills/tistory-blog/SKILL.md')
];

const AI_PATTERNS = [
  '한 줄 요약',
  '먼저 핵심만 보자',
  '바로 본론으로',
  '이 글에서는 다음과 같은 내용을',
  '결론적으로 말씀드리면',
  '아래와 같이 정리할 수 있습니다'
];

const MIN_PLAIN_CHARS = 1800;
const MIN_PARAGRAPHS = 8;
const MIN_SECTIONS = 4;

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function countTag(html, tag) {
  const re = new RegExp(`<${tag}\\b`, 'gi');
  return (String(html || '').match(re) || []).length;
}

export async function loadSkillText() {
  for (const candidate of SKILL_CANDIDATES) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // continue
    }
  }
  return '';
}

export function qaHtmlPost(html, options = {}) {
  const title = String(options.title || '').trim();
  const keyword = String(options.keyword || '').trim();
  const contentType = String(options.contentType || '').trim();
  const ymylRisk = String(options.ymylRisk || '').trim();
  const minPlain = options.minPlainChars ?? MIN_PLAIN_CHARS;
  const minParagraphs = options.minParagraphs ?? MIN_PARAGRAPHS;
  const minSections = options.minSections ?? MIN_SECTIONS;
  const now = options.now ? new Date(options.now) : new Date();

  const plain = stripHtml(html);
  const failures = [];
  const warnings = [];

  if (!html || !String(html).trim()) {
    failures.push({ code: 'empty-html', message: 'HTML 본문이 비어 있다.' });
  }

  if (!/font-size\s*:\s*16px/i.test(html) || !/line-height\s*:\s*1\.82/i.test(html)) {
    failures.push({ code: 'missing-wrapper-style', message: '루트 래퍼 스타일(font-size:16px; line-height:1.82)이 없다.' });
  }

  if (/```/.test(html)) {
    failures.push({ code: 'markdown-fence', message: '마크다운 코드펜스(```)가 포함되어 있다.' });
  }

  if (/<\/?details\b/i.test(html) || /<\/?summary\b/i.test(html)) {
    failures.push({ code: 'unsupported-details', message: 'Tistory 미지원 details/summary 태그가 있다.' });
  }

  for (const pattern of AI_PATTERNS) {
    if (plain.includes(pattern) || html.includes(pattern)) {
      failures.push({ code: 'ai-pattern', message: `금지 AI 패턴 발견: ${pattern}` });
    }
  }

  const pCount = countTag(html, 'p');
  const h2Count = countTag(html, 'h2');
  const h1Count = countTag(html, 'h1');
  const tableCount = countTag(html, 'table');
  const figureCount = countTag(html, 'figure');
  const blockquoteCount = countTag(html, 'blockquote');

  if (plain.length < minPlain) {
    failures.push({
      code: 'too-short',
      message: `본문 텍스트가 짧다 (${plain.length}자 < ${minPlain}자).`
    });
  }

  if (pCount < minParagraphs) {
    failures.push({
      code: 'too-few-paragraphs',
      message: `문단 수가 부족하다 (p=${pCount} < ${minParagraphs}).`
    });
  }

  if ((h1Count + h2Count) < minSections) {
    failures.push({
      code: 'too-few-sections',
      message: `섹션 헤더가 부족하다 (h1+h2=${h1Count + h2Count} < ${minSections}).`
    });
  }

  // 이모지 섹션 헤더: h2 안에 이모지/심볼
  const emojiHeader = /<h2[^>]*>[\s\S]{0,40}[\u{1F300}-\u{1FAFF}⚙️💡📋💰🏠📈🔍🚀⚖️🛠️⚠️🏗️🧩📐🐛🔧💻📝🔄📊📖]/u.test(html);
  if (!emojiHeader) {
    failures.push({ code: 'missing-emoji-header', message: '이모지 섹션 헤더(h2)가 없다.' });
  }

  const hasInsight = /#fefce8/i.test(html) || /#fde68a/i.test(html);
  const hasInfo = /#3b82f6/i.test(html) || /#eff6ff/i.test(html);
  if (!hasInsight) {
    failures.push({ code: 'missing-insight-box', message: '노란 인사이트 박스가 없다.' });
  }
  if (!hasInfo) {
    failures.push({ code: 'missing-info-box', message: '파란 정보 박스가 없다.' });
  }

  if (blockquoteCount < 1) {
    warnings.push({ code: 'missing-blockquote', message: '블록인용이 없다. 가능하면 1개 이상 넣는 것이 좋다.' });
  }

  if (tableCount < 1 && /비교|계산|한도|요금|추천/.test(`${title} ${keyword} ${plain}`)) {
    warnings.push({ code: 'missing-table', message: '비교/계산형 주제인데 테이블이 없다.' });
  }

  if (figureCount < 1) {
    warnings.push({ code: 'missing-figure', message: 'figure 이미지가 없다.' });
  }

  if (title && title.length < 8) {
    failures.push({ code: 'weak-title', message: `제목이 너무 짧거나 약하다: ${title}` });
  }

  // 제목이 섹션 소제목처럼 보이면 경고
  if (title && /^(서비스 개요|기본 정보|핵심 포인트|이란\?|업무 생산성)/.test(title)) {
    failures.push({ code: 'section-like-title', message: `SEO 제목이 아니라 섹션 제목처럼 보인다: ${title}` });
  }

  if (keyword && plain && !plain.includes(keyword.replace(/\s+/g, '')) && !plain.includes(keyword)) {
    // soft: keyword variants may differ
    warnings.push({ code: 'keyword-missing', message: `본문에 키워드가 직접 보이지 않는다: ${keyword}` });
  }

  // ─── 설계 문서 §7 QA 확장 5종 (기존 판정 유지 + 추가 게이트) ──────────

  // 1) 낡은 연도 제목 (D7: "2025년 실전 가이드"가 2026년에 발행 예정이던 사례)
  const titleYears = [...String(title).matchAll(/20\d{2}/g)].map(m => Number(m[0]));
  if (titleYears.length) {
    const maxYear = Math.max(...titleYears);
    const curYear = now.getFullYear();
    if (maxYear < curYear) {
      failures.push({ code: 'stale-year-title', message: `제목 연도(${maxYear})가 올해(${curYear})보다 낮다. 기준일/연도 갱신 필요: ${title}` });
    } else if (maxYear > curYear + 1) {
      warnings.push({ code: 'future-year-title', message: `제목 연도(${maxYear})가 미래로 지나치게 멀다: ${title}` });
    }
  }

  // 2) 실측 주장인데 출처 없음 (설계 §7: 비용형/절차형 fail, 그 외 warning)
  const hasFactClaim = /[\d,]+(\s*만원|\s*원)|(년 기준|년도 기준|개정|시행|발표|보조금|지원금|수수료)/.test(plain);
  const hasCitation = /출처|자료[:：]|기준[:：]|기준일|참고|통계청|금융감독원|국세청|공식|발표|조사|약관|요금표/.test(plain);
  const isCostOrProcedure = ['cost', 'checklist', 'guide', 'procedure', 'comparison'].includes(contentType)
    || (!contentType && /비용|가격|요금|견적|렌탈|이사|청소|설치|교체|위약금/.test(`${title} ${keyword}`));
  if (hasFactClaim && !hasCitation) {
    const msg = '비용/기준일/통계 주장이 있는데 출처 표시가 없다. (출처: …) 를 명시하라.';
    if (isCostOrProcedure) failures.push({ code: 'missing-citation', message: msg });
    else warnings.push({ code: 'missing-citation', message: msg });
  }

  // 3) YMYL 금지 문구 — YMYL 위험 주제에서만 hard fail (비용형 일상 표현 오탐 방지)
  const deniedPhrase = YMYL_DENIED_PATTERNS.find(p => plain.includes(p) || title.includes(p));
  if (deniedPhrase) {
    const msg = `YMYL 금지 문구 발견: ${deniedPhrase}`;
    if (ymylRisk === 'high' || ymylRisk === 'medium') {
      failures.push({ code: 'ymyl-denied-phrase', message: msg });
    } else {
      warnings.push({ code: 'ymyl-denied-phrase', message: msg });
    }
  }

  // 4) 비용형 비교표 — contentType=cost 우선, 없으면 키워드 휴리스틱
  const isCostType = contentType === 'cost' || contentType === 'comparison'
    || (!contentType && /비용|가격|요금|견적|렌탈|이사|청소|설치|교체|위약금/.test(`${title} ${keyword}`));
  if (isCostType && tableCount < 1) {
    failures.push({ code: 'missing-table-for-cost', message: `비용/요금 주제인데 가격표(테이블)가 없다: ${keyword || title}` });
  }

  // 5) 오프너가 인사말/빈약 (훅 없이 시작하면 체류 지표 하락)
  const firstPara = (String(html).match(/<p\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '';
  const firstText = stripHtml(firstPara);
  if (/^(안녕하세요|반갑습니다|오늘은|이 글은|이번 글)/.test(firstText) || (firstText && firstText.length < 15)) {
    warnings.push({ code: 'weak-opener', message: '오프너가 인사말/빈약하다. 첫 문단부터 훅(문제 공감·숫자·질문)으로 시작하라.' });
  }

  // 균일 문단 길이 탐지 (모든 p가 비슷한 길이면 AI 티)
  const paragraphs = [...String(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => stripHtml(m[1]))
    .filter(t => t.length >= 20);
  if (paragraphs.length >= 6) {
    const lengths = paragraphs.map(t => t.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + ((b - avg) ** 2), 0) / lengths.length;
    const stdev = Math.sqrt(variance);
    if (stdev < 18) {
      warnings.push({ code: 'uniform-paragraphs', message: `문단 길이가 지나치게 균일하다 (stdev=${stdev.toFixed(1)}).` });
    }
  }

  const scoreBase = 100;
  const failPenalty = failures.length * 18;
  const warnPenalty = warnings.length * 4;
  const score = Math.max(0, scoreBase - failPenalty - warnPenalty);
  const ok = failures.length === 0 && plain.length >= minPlain;

  return {
    ok,
    score,
    metrics: {
      plainChars: plain.length,
      paragraphs: pCount,
      h1: h1Count,
      h2: h2Count,
      tables: tableCount,
      figures: figureCount,
      blockquotes: blockquoteCount,
      hasInsight,
      hasInfo,
      emojiHeader
    },
    failures,
    warnings,
    title,
    keyword
  };
}

export async function qaHtmlPostWithMarket(html, options = {}) {
  const base = qaHtmlPost(html, options);
  const keyword = String(options.keyword || base.keyword || '').trim();
  const category = String(options.category || '').trim();
  let market = options.market || null;
  const enableMarket = options.marketResearch !== false;

  if (enableMarket && keyword) {
    try {
      market = market || await researchKeywordMarket(keyword, { category, force: options.forceMarket === true });
      const plain = stripHtml(html);
      const marketEval = evaluateAgainstMarket({
        title: options.title || base.title || '',
        html,
        plain,
        keyword,
        category
      }, market);
      base.failures.push(...(marketEval.failures || []));
      base.warnings.push(...(marketEval.warnings || []));
      base.suggestions = [...new Set([...(base.suggestions || []), ...(marketEval.suggestions || [])])];
      base.market = {
        keyword: market.keyword,
        intent: market.intent,
        cpcTier: market.cpcTier,
        sampleCount: market.sampleCount,
        avgTitleLength: market.avgTitleLength,
        topHookLabels: market.topHookLabels,
        commonTokens: (market.commonTokens || []).slice(0, 10),
        competitors: (market.competitors || []).slice(0, 6).map(c => c.title),
        recommendations: (market.recommendations || []).slice(0, 6)
      };
      base.score = Math.max(0, (base.score || 0) + (marketEval.scoreDelta || 0));
      base.ok = base.failures.length === 0 && (base.metrics?.plainChars || 0) >= (options.minPlainChars ?? MIN_PLAIN_CHARS);
    } catch (error) {
      base.warnings.push({
        code: 'market-research-error',
        message: `시장 리서치 실패: ${error instanceof Error ? error.message : String(error)}`
      });
      base.score = Math.max(0, (base.score || 0) - 3);
    }
  }

  if (options.notifyDiscord) {
    try {
      await notifyQaResult({
        title: options.title || base.title || '',
        keyword,
        ok: base.ok,
        score: base.score,
        failures: base.failures,
        warnings: base.warnings,
        market: base.market || null
      });
    } catch {
      // ignore notify errors
    }
  }

  return base;
}

export async function qaMetaPost(meta, options = {}) {
  const bodyFile = meta.bodyFile || meta.bodyHtmlFile || '';
  if (!bodyFile) {
    return {
      ok: false,
      score: 0,
      failures: [{ code: 'missing-body-file', message: 'meta.bodyFile 이 없다.' }],
      warnings: [],
      metrics: {},
      title: meta.title || '',
      keyword: meta.keyword || ''
    };
  }

  let html = '';
  try {
    html = await fs.readFile(bodyFile, 'utf8');
  } catch (error) {
    return {
      ok: false,
      score: 0,
      failures: [{ code: 'body-file-missing', message: `본문 파일을 읽을 수 없다: ${bodyFile}` }],
      warnings: [],
      metrics: {},
      title: meta.title || '',
      keyword: meta.keyword || ''
    };
  }

  // bodyHtml 이 파일 경로가 아니라 인라인이면 그걸 우선
  if (meta.bodyHtml && /<div|<p|<h2/i.test(meta.bodyHtml)) {
    html = meta.bodyHtml;
  }

  return qaHtmlPostWithMarket(html, {
    title: meta.title || '',
    keyword: meta.keyword || '',
    category: meta.category || '',
    contentType: meta.contentType || options.contentType || '',
    ymylRisk: meta.ymylRisk || options.ymylRisk || '',
    notifyDiscord: options.notifyDiscord === true,
    marketResearch: options.marketResearch !== false,
    ...options
  });
}

export async function writeQaReport(targetPath, report) {
  const out = {
    checkedAt: new Date().toISOString(),
    ...report
  };
  await fs.writeFile(targetPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  return out;
}

function parseArgs(argv) {
  const args = { file: '', dir: '', meta: '', json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--file' && n) { args.file = n; i++; }
    else if (a === '--dir' && n) { args.dir = n; i++; }
    else if (a === '--meta' && n) { args.meta = n; i++; }
    else if (a === '--json') args.json = true;
    else if (a === '--help') {
      console.log('사용법: node qa-post.mjs --file <html> | --dir <dir> | --meta <meta.json>');
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const reports = [];

  if (args.file) {
    const html = await fs.readFile(args.file, 'utf8');
    const report = await qaHtmlPostWithMarket(html, { title: path.basename(args.file, '.html'), marketResearch: true });
    reports.push({ target: args.file, ...report });
  } else if (args.meta) {
    const meta = JSON.parse(await fs.readFile(args.meta, 'utf8'));
    const report = await qaMetaPost(meta);
    reports.push({ target: args.meta, ...report });
  } else if (args.dir) {
    const entries = await fs.readdir(args.dir);
    for (const name of entries.filter(n => n.endsWith('.html')).sort()) {
      const full = path.join(args.dir, name);
      const html = await fs.readFile(full, 'utf8');
      const metaPath = full.replace(/\.html$/, '.meta.json');
      let title = name;
      let keyword = '';
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        title = meta.title || title;
        keyword = meta.keyword || '';
      } catch {
        // ignore
      }
      let category = '';
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        category = meta.category || '';
      } catch {}
      const report = await qaHtmlPostWithMarket(html, { title, keyword, category, marketResearch: true });
      reports.push({ target: full, ...report });
      await writeQaReport(full.replace(/\.html$/, '.qa.json'), report);
    }
  } else {
    console.error('--file, --dir, --meta 중 하나가 필요하다.');
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const r of reports) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'} score=${r.score} ${r.target}`);
      console.log(`  plain=${r.metrics.plainChars || 0} p=${r.metrics.paragraphs || 0} h2=${r.metrics.h2 || 0}`);
      for (const f of r.failures || []) console.log(`  - FAIL ${f.code}: ${f.message}`);
      for (const w of r.warnings || []) console.log(`  - WARN ${w.code}: ${w.message}`);
      if (r.market) {
        console.log(`  market intent=${r.market.intent} cpc=${r.market.cpcTier} samples=${r.market.sampleCount}`);
        if (r.market.competitors?.length) console.log(`  top: ${r.market.competitors[0]}`);
      }
      for (const s of (r.suggestions || []).slice(0, 4)) console.log(`  - TODO ${s}`);
    }
    const pass = reports.filter(r => r.ok).length;
    console.log(`\nSUMMARY ${pass}/${reports.length} passed`);
  }

  if (reports.some(r => !r.ok)) process.exit(2);
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('qa-post.mjs')) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
