#!/usr/bin/env node
/**
 * generate-post.mjs — 키워드 기반 블로그 포스트 자동 생성
 *
 * 파이프라인:
 *   keywords.json → 소스 리서치 → LLM 글 생성 → 이미지 생성 → HTML 저장
 *
 * 사용법:
 *   node scripts/content/generate-post.mjs --keyword-id invest-01
 *   node scripts/content/generate-post.mjs --keyword "ISA 추천 2026" --category "투자·재테크"
 *   node scripts/content/generate-post.mjs --batch --count 5
 *   node scripts/content/generate-post.mjs --list
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadProjectEnv } from '../lib/load-env.mjs';
import { qaHtmlPostWithMarket, writeQaReport } from './qa-post.mjs';
import { researchKeywordMarket, buildMarketPromptBlock } from './market-research.mjs';
import { buildSourceBundleFromMarket, isOfficialSourceUrl } from './provenance-gate.mjs';
import { buildDuplicateGate, isAlreadyPublished } from '../lib/published-posts.mjs';
import {
  detectYmylRisk,
  scoreKeyword,
  computeSelectionScore,
  freshnessFactor,
  normalizeGapScore,
  topicClusterOf,
  topicDiversityFactor,
  applyTopicDiversity
} from './keyword-score.mjs';
import { recentGeneratedPosts } from './select-keywords.mjs';
import { buildTemplatePrompt, getTemplateById, renderTemplateFallback, selectTemplate } from '../../src/core/templates/catalog.mjs';
import {
  acquireRepresentativeImage,
  validateImageFile,
  writeImageProvenance
} from '../../src/core/media/image-acquisition.mjs';
loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'content', 'generated');

const PUBLISHED_LEDGER_PATH = process.env.PUBLISHED_LEDGER_PATH
  || path.join(PROJECT_ROOT, 'content', 'published.json');

// ─── CLI ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    keywordId: '',
    keyword: '',
    category: '',
    contentType: '',
    batch: false,
    count: 1,
    list: false,
    dryRun: false,
    outputDir: '',
    skipImage: false,
    provider: process.env.LLM_PROVIDER || 'auto',
    apiBase: process.env.LLM_API_BASE || process.env.XIAOMI_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || process.env.XIAOMI_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || '',
    templateId: '',
    templateSeed: '',
    promptOnly: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--keyword-id' && next) { args.keywordId = next; i++; }
    else if (arg === '--keyword' && next) { args.keyword = next; i++; }
    else if (arg === '--category' && next) { args.category = next; i++; }
    else if (arg === '--content-type' && next) { args.contentType = next; i++; }
    else if (arg === '--batch') { args.batch = true; }
    else if (arg === '--count' && next) { args.count = Number.parseInt(next, 10) || 1; i++; }
    else if (arg === '--list') { args.list = true; }
    else if (arg === '--dry-run') { args.dryRun = true; }
    else if (arg === '--output-dir' && next) { args.outputDir = next; i++; }
    else if (arg === '--skip-image') { args.skipImage = true; }
    else if (arg === '--provider' && next) { args.provider = next; i++; }
    else if (arg === '--api-base' && next) { args.apiBase = next; i++; }
    else if (arg === '--api-key' && next) { args.apiKey = next; i++; }
    else if (arg === '--model' && next) { args.model = next; i++; }
    else if (arg === '--template-id' && next) { args.templateId = next; i++; }
    else if (arg === '--template-seed' && next) { args.templateSeed = next; i++; }
    else if (arg === '--prompt-only') { args.promptOnly = true; }
    else if (arg === '--help') {
      console.log(`사용법: node generate-post.mjs [옵션]

옵션:
  --keyword-id ID     keywords.json에서 특정 키워드 선택
  --keyword TEXT      직접 키워드 입력
  --category TEXT     카테고리
  --content-type TYPE 글 유형 (guide/comparison/calculator/list/tutorial/info)
  --batch             미발행 키워드 일괄 처리
  --count N           배치 처리할 글 수
  --list              사용 가능한 키워드 목록 출력
  --dry-run           실제 생성 없이 출력만
  --output-dir DIR    출력 디렉토리
  --skip-image        이미지 생성 생략
  --provider TYPE     LLM 백엔드 (auto/hermes/openai/openai-compat/template)
  --api-base URL      OpenAI-compatible API 엔드포인트 (Mimo v2.5 등)
  --api-key KEY       API 키
  --model NAME        사용할 모델 이름
  --template-id ID    템플릿 고정 선택 (기본: 키워드 ID 기반 결정적 선택)
  --template-seed KEY 템플릿 선택 시드 덮어쓰기
  --prompt-only       프롬프트 파일만 출력 (수동 실행용)

LLM_PROVIDER 환경변수:
  hermes       — hermes CLI (-z 모드, hermes auth 필요)
  openai       — OpenAI API (OPENAI_API_KEY)
  openai-compat — Mimo v2.5 등 OpenAI-compatible API
  template     — LLM 없이 HTML 템플릿

예시:
  # hermes로 글 생성
  node generate-post.mjs --keyword-id invest-01 --provider hermes

  # Xiaomi MiMo v2.5 공식 API로 글 생성
  node generate-post.mjs --keyword-id invest-01 \\
    --provider openai-compat \\
    --api-base https://api.xiaomimimo.com/v1 \\
    --api-key \$XIAOMI_API_KEY \\
    --model mimo-v2.5

  # 프롬프트 파일만 생성 (hermes에서 수동 실행)
  node generate-post.mjs --keyword-id invest-01 --prompt-only`);
      process.exit(0);
    }
  }
  return args;
}

// ─── 키워드 로드 ─────────────────────────────────────────────────────

async function loadKeywordsData() {
  const raw = await fs.readFile(KEYWORDS_PATH, 'utf8');
  return JSON.parse(raw);
}

async function loadKeywords() {
  const data = await loadKeywordsData();
  return data.keywords || [];
}

function pickKeyword(keywords, args) {
  if (args.keywordId) {
    const found = keywords.find(k => k.id === args.keywordId);
    if (!found) throw new Error(`키워드를 찾을 수 없다: ${args.keywordId}`);
    return found;
  }
  if (args.keyword) {
    return {
      id: 'manual-' + Date.now(),
      keyword: args.keyword,
      category: args.category || 'IT·테크',
      cpcTier: 'B',
      contentType: args.contentType || 'guide',
      tags: [],
      description: ''
    };
  }
  throw new Error('--keyword-id 또는 --keyword가 필요하다.');
}

function pickUnpublished(keywords, generatedIds) {
  return keywords.filter(k => k && k.enabled !== false && !generatedIds.has(k.id));
}

// 배치 생성 순서: selectionScore + 소주제 다양성 greedy (auto-queue와 동일 취지)
function rankBatchCandidates(keywords, recentClusters = [], count = 1, gateOpts = {}) {
  const remaining = keywords.map(kw => {
    const r = scoreKeyword(kw, gateOpts);
    const gapScore = normalizeGapScore(kw.gap);
    const freshness = freshnessFactor(kw.metrics?.checkedAt || kw.researchedAt, new Date(), 14);
    const baseScore = computeSelectionScore({
      commercialIntentScore: r.score.intent,
      qaScore: 50, // 생성 전 — 중립 QA
      serpGapScore: gapScore,
      freshness
    });
    return {
      kw,
      r,
      topicCluster: topicClusterOf(kw),
      baseScore,
      selectionScore: baseScore
    };
  }).filter(row => row.kw.enabled !== false && row.r.gates.ymyl.allowed && row.r.gates.focus.allowed);

  const selected = [];
  const batchClusters = [...recentClusters];
  while (remaining.length && selected.length < count) {
    for (const row of remaining) {
      const div = topicDiversityFactor(row.topicCluster, batchClusters);
      row.diversity = div;
      row.selectionScore = applyTopicDiversity(row.baseScore, div);
    }
    remaining.sort((a, b) => b.selectionScore - a.selectionScore || b.r.score.total - a.r.score.total);
    const next = remaining.shift();
    selected.push(next);
    batchClusters.push(next.topicCluster);
  }
  return selected.map(s => s.kw);
}

// ─── 소스 리서치 ─────────────────────────────────────────────────────
async function researchKeyword(keywordEntry) {
  const keyword = keywordEntry.keyword;
  console.log(`[research] "${keyword}" 리서치 중...`);

  let market = null;
  try {
    market = await researchKeywordMarket(keyword, { category: keywordEntry.category || '' });
    console.log(`[research] market intent=${market.intent} cpc=${market.cpcTier} samples=${market.sampleCount}`);
    if (market.competitors?.length) {
      console.log(`[research] top title: ${market.competitors[0].title}`);
    }
  } catch (error) {
    console.error(`[research] market failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ymylRisk derive via detectYmylRisk instead of default none
  let ymylRisk = String(keywordEntry.ymylRisk ?? '').trim().toLowerCase();
  if (!ymylRisk || ymylRisk === 'unknown' || ymylRisk === 'null' || ymylRisk === 'undefined' || ymylRisk === 'none') {
    try {
      const derived = detectYmylRisk(keyword, keywordEntry.category || '');
      const derivedRisk = derived && derived.risk ? String(derived.risk).trim().toLowerCase() : 'none';
      // stored 'none'이지만 실제 YMYL 고위험이면 derived high로 교정 (fail-closed)
      if (ymylRisk === 'none' && derivedRisk === 'none') {
        ymylRisk = 'none';
      } else if (!ymylRisk || ymylRisk === 'unknown' || ymylRisk === 'null' || ymylRisk === 'undefined' || ymylRisk === 'none') {
        ymylRisk = derivedRisk || 'none';
      }
    } catch {
      if (!ymylRisk) ymylRisk = 'none';
    }
  }
  if (!ymylRisk) ymylRisk = 'none';

  // SERP 경쟁 정보와 키워드 발굴 당시의 실측/추세 신호를 함께 보존한다.
  let filteredMarket = market
    ? {
      ...market,
      metrics: keywordEntry.metrics || market.metrics || null,
      discovery: keywordEntry.marketDiscovery || market.discovery || null
    }
    : null;
  if (filteredMarket && Array.isArray(filteredMarket.competitors) && filteredMarket.competitors.length) {
    const officialOnly = filteredMarket.competitors.filter((c) => {
      const url = String(c?.url || c?.link || '').trim();
      return url && isOfficialSourceUrl(url);
    });
    filteredMarket = { ...filteredMarket, competitors: officialOnly };
  }
  const sourceBundle = buildSourceBundleFromMarket(filteredMarket);
  if (sourceBundle.length) {
    console.log(`[research] sourceBundle ${sourceBundle.length}건 생성 (official 필터 후)`);
  } else if (ymylRisk === 'high' || ymylRisk === 'medium') {
    console.log(`[research] YMYL ${ymylRisk} — 공식 출처 0건 (generic blog URL만 있으면 fail)`);
  }

  const context = {
    id: keywordEntry.id || '',
    keyword: keyword,
    category: keywordEntry.category,
    description: keywordEntry.description || '',
    contentType: keywordEntry.contentType || 'guide',
    tags: keywordEntry.tags || [],
    cpcTier: market?.cpcTier || keywordEntry.cpcTier || 'B',
    ymylRisk,
    sourceBundle,
    market: filteredMarket,
    marketPrompt: buildMarketPromptBlock(filteredMarket)
  };

  return context;
}

function applyTemplateSelection(context, args = {}) {
  const templateSeed = String(args.templateSeed || context.templateSeed || context.id || context.keyword || 'post');
  const template = selectTemplate({
    seed: templateSeed,
    templateId: args.templateId || context.templateId || ''
  });
  return {
    ...context,
    templateId: template.id,
    templateLabel: template.label,
    templateSeed
  };
}

// ─── HTML 글 생성 (LLM) ─────────────────────────────────────────────

async function loadTistoryBlogSkill() {
  const candidates = [
    path.join(PROJECT_ROOT, '.codex/skills/tistory-blog/SKILL.md'),
    path.join(process.env.HOME || '/home/declan', '.codex/skills/tistory-blog/SKILL.md')
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // continue
    }
  }
  return '';
}

async function buildSystemPrompt(context = {}) {
  const skill = await loadTistoryBlogSkill();
  const skillBlock = skill
    ? `\n\n[tistory-blog SKILL.md 원문]\n${skill.slice(0, 12000)}\n[/tistory-blog SKILL.md]\n`
    : '';
  const curYear = new Date().getFullYear();
  const template = getTemplateById(context.templateId)
    || selectTemplate({ seed: context.templateSeed || context.id || context.keyword });

  return `당신은 한국어 티스토리 블로그 전문 작가다.
아래 tistory-blog 스킬 규칙을 최우선으로 따른다.
${skillBlock}

이번 글의 고정 템플릿:
- ID: ${template.id}
- 이름: ${template.label}
- 레이아웃 요소: ${template.layout.join(' → ')}
- 템플릿 지시: ${template.prompt}

필수 준수:
1. 순수 HTML만 출력한다. 마크다운 금지.
2. <details>, <summary>, 코드펜스(\`\`\`) 금지.
3. 루트는 반드시 <div style="font-size:16px;line-height:1.82;color:#1f2937;max-width:800px;margin:0 auto;"> 로 시작한다.
4. 맨 위에 SEO 제목용 <h1> 1개를 넣는다. h1은 키워드를 포함한 완성된 글 제목이어야 한다.
5. 본문 섹션은 <h2> 5~7개, 각 h2 앞에 이모지를 붙인다.
6. 노란 인사이트 박스(#fefce8) 최소 1개, 파란 정보 박스(#eff6ff + #3b82f6) 최소 2개.
7. 블록인용 <blockquote> 최소 1개, 비교/수치 주제면 <table> 최소 1개.
8. figure+figcaption 이미지 최소 1개.
9. 본문 한국어 plain text 기준 2,200자 이상. 문단 p 태그 10개 이상.
10. AI 패턴 금지: "한 줄 요약", "먼저 핵심만 보자", "바로 본론으로".
11. 문단 길이를 균일하게 쓰지 말고 강약을 섞는다.
12. 선택 템플릿의 순서와 정보 밀도를 지키되, 근거 없는 사실이나 형식용 문장을 만들지 않는다.
13. 출력은 HTML만. 설명 문장, 코드블록 감싸기 금지.

수익형 블로그 안전 규칙 (설계 문서 §3):
14. 제목/본문의 연도는 현재 연도(${curYear}) 기준으로 쓴다. 지난 연도(2025 이하)를 제목에 넣지 않는다.
15. 비용·가격·수치·기준일을 주장할 때는 반드시 근처에 (출처: …) 를 명시한다. 추정치는 "약/대략"으로 표현한다.
16. 금지 문구: 무조건 승인, 승인 보장, 가장 좋은 보험/대출, 확실히 줄이는/내리는, 소송에서 이기는, 치료 효과, 완치, 부작용 없이.
17. 금융·보험·건강·법률(YMYL) 주제는 결정을 강요하지 않고 공식 절차·서류·문의처·수수료 정보만 제공한다.
18. 비용/요금 주제(비용·가격·요금·견적·렌탈·이사·청소·설치·교체·위약금)는 항목별 가격표(<table>)와 추가요금·별도 비용 항목을 반드시 포함한다.
19. 첫 문단은 인사말이 아니라 훅으로 시작한다: 구체적 숫자, 문제 공감, 또는 질문.`;
}

function buildUserPrompt(context) {
  const contentTypeDescriptions = {
    guide: '상세 가이드: 개념 설명 → 단계별 방법 → 주의사항 → 마무리',
    comparison: '비교 분석: 3~5개 대상 비교표 + 장단점 + 추천',
    calculator: '계산 방법: 공식 설명 + 실제 계산 예시 + 팁',
    list: '리스트/모음: 관련 도구/방법/상품을 10개 이상 정리',
    tutorial: '튜토리얼: 설치/설정 → 사용법 → 꿀팁',
    info: '정보 정리: 최신 데이터/정책/수치를 한눈에 정리',
    cost: '비용 정리: (현재 연도 기준) 항목별 가격표 + 추가요금·별도 비용 + 견적 받는 법 + 아끼는 팁',
    problem: '문제 해결: 증상/문제 인식 → 원인 → 해결 방법 → 예방·주의사항',
    checklist: '체크리스트: 단계별 체크리스트 표 + 준비물 + 실수 방지'
  };

  const typeDesc = contentTypeDescriptions[context.contentType] || contentTypeDescriptions.guide;
  const curYear = new Date().getFullYear();
  const template = getTemplateById(context.templateId)
    || selectTemplate({ seed: context.templateSeed || context.id || context.keyword });
  const templateInstructions = buildTemplatePrompt(template.id);

  return `"${context.keyword}"에 대한 블로그 글을 작성해라.

카테고리: ${context.category}
글 유형: ${typeDesc}
선택 템플릿: ${template.label} (${template.id})
템플릿 레이아웃: ${template.layout.join(' → ')}
템플릿별 작성 지시: ${templateInstructions}
${context.description ? `주제 설명: ${context.description}` : ''}
태그: ${(context.tags || []).join(', ')}
추정 CPC 티어: ${context.cpcTier || 'B'}

${context.marketPrompt || ''}

요구사항:
- 분량: plain text 기준 2,200~3,500자 (한국어)
- 독자: 해당 분야에 관심 있는 일반인
- 형식: 순수 HTML만 (마크다운 금지)
- 시작: <div style="font-size:16px;line-height:1.82;color:#1f2937;max-width:800px;margin:0 auto;">
- 첫 요소: <h1>SEO 제목</h1> (키워드 포함, 28~48자)
- 이어서 도입 문단 2~3개 — 인사말 금지, 첫 문단부터 훅(숫자/문제 공감/질문)으로 시작
- 본문 h2 섹션 5~7개
- 노란 인사이트 박스 1개+, 파란 정보 박스 2개+, blockquote 1개+
- 수치/비교가 있으면 table 필수
- figure+figcaption 이미지 1개 이상. 출처와 대체 텍스트를 함께 둔다.
- 첫 문단에 키워드를 자연스럽게 포함
- 마지막에 선택 템플릿에 맞는 결론·참고 자료 섹션을 완성한다
- 글이 중간에 끊기면 안 된다. 마지막 문장은 완전한 종결형(~다/~습니다)으로 끝낸다
- 미완성 문장, 깨진 HTML, 중국어 한자 혼입 금지
- 출력은 HTML 문서 조각만. 앞뒤 설명 금지
- 반드시 </div> 로 정상 종료

데이터 신뢰 규칙:
- 제목/본문 연도는 현재 연도(${curYear})만 쓴다. 지난 연도(2025 이하) 제목 금지.
- 비용·가격·수치·기준일 주장에는 근처에 (출처: …) 를 명시한다. 추정치는 "약/대략"으로.
- 금지 문구: 무조건 승인, 승인 보장, 가장 좋은 보험/대출, 확실히 줄이는, 확실히 내리는, 치료 효과, 완치, 부작용 없이.
${context.contentType === 'cost' ? '- 비용형: 항목별 가격표(<table>) 필수, 추가요금·별도 비용(옵션/할증/위약금) 섹션 필수.' : ''}`;
}

async function generateWithLLM(context, args = {}) {
  const provider = args.provider || 'auto';
  const systemPrompt = await buildSystemPrompt(context);
  const userPrompt = buildUserPrompt(context);

  // ── Provider 자동 탐지 ──
  let resolvedProvider = provider;
  if (provider === 'auto') {
    if (args.apiBase || args.apiKey || process.env.XIAOMI_API_KEY || process.env.LLM_API_KEY) {
      resolvedProvider = 'openai-compat';
    } else if (process.env.HERMES_API_KEY || process.env.NOUS_API_KEY) {
      resolvedProvider = 'hermes';
    } else if (process.env.OPENAI_API_KEY) {
      resolvedProvider = 'openai';
    } else {
      resolvedProvider = 'template';
    }
    console.log(`[llm] auto 탐지 → ${resolvedProvider}`);
  }

  if (resolvedProvider === 'hermes') {
    return generateWithHermes(systemPrompt, userPrompt, context, args);
  }
  if (resolvedProvider === 'openai' || resolvedProvider === 'openai-compat') {
    return generateWithOpenAI(systemPrompt, userPrompt, context, args);
  }
  console.log('[llm] LLM 없음 — 템플릿 모드로 생성');
  return { html: renderTemplateFallback(context), usingTemplate: true };
}

async function generateWithHermes(systemPrompt, userPrompt, context, args) {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  const promptDir = path.join(OUTPUT_DIR, 'prompts');
  await fs.mkdir(promptDir, { recursive: true });
  const slug = (context.keyword || 'post').replace(/[^a-zA-Z0-9가-힣]+/g, '-').slice(0, 30);
  const promptFile = path.join(promptDir, `${slug}-${Date.now()}.txt`);
  await fs.writeFile(promptFile, fullPrompt, 'utf8');
  console.log(`[hermes] 프롬프트 저장: ${promptFile}`);

  // hermes -z 모드 시도 (기본: xiaomi / mimo-v2.5)
  try {
    const model = args.model || process.env.LLM_MODEL || 'mimo-v2.5';
    const providerFlag = /mimo/i.test(model) ? '--provider xiaomi' : '';
    const modelFlag = `-m ${model}`;
    const result = execSync(`hermes ${providerFlag} ${modelFlag} -z "$(cat '${promptFile}')"`, {
      timeout: 300000,
      stdio: 'pipe',
      encoding: 'utf8',
      shell: '/bin/bash'
    });
    const output = result.trim();
    if (output && output.length > 100) {
      console.log(`[hermes] 응답 수신 (${output.length}자)`);
      return { html: extractHtmlFromResponse(output), usingTemplate: false };
    }
  } catch (e) {
    console.error(`[hermes] CLI 실패: ${e.message.split('\n')[0]}`);
  }

  console.log(`[hermes] 수동 실행이 필요하다:`);
  console.log(`  hermes -z "$(cat '${promptFile}')" > output.html`);
  return { html: renderTemplateFallback(context), usingTemplate: true };
}

async function generateWithOpenAI(systemPrompt, userPrompt, context, args) {
  const apiKey = args.apiKey
    || process.env.LLM_API_KEY
    || process.env.XIAOMI_API_KEY
    || process.env.OPENAI_API_KEY
    || '';
  let apiBase = (args.apiBase || process.env.LLM_API_BASE || process.env.XIAOMI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  if (!apiBase.endsWith('/v1') && /xiaomimimo\.com$/i.test(new URL(apiBase.includes('://') ? apiBase : `https://${apiBase}`).hostname)) {
    apiBase = `${apiBase}/v1`;
  }

  const isMimo = /xiaomimimo\.com/i.test(apiBase) || /mimo/i.test(args.model || process.env.LLM_MODEL || '');
  const model = args.model
    || process.env.LLM_MODEL
    || (isMimo ? 'mimo-v2.5' : 'gpt-4o');

  if (!apiKey) {
    console.log('[openai] API 키 없음 — 템플릿 모드');
    return { html: renderTemplateFallback(context), usingTemplate: true };
  }

  const host = new URL(apiBase.includes('://') ? apiBase : `https://${apiBase}`).hostname;
  console.log(`[llm] ${host} 글 생성 중... 모델: ${model}`);

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7
  };
  // Xiaomi MiMo 공식 API는 max_completion_tokens 사용
  if (isMimo) body.max_completion_tokens = 8192;
  else body.max_tokens = 8192;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  };
  if (isMimo) headers['api-key'] = apiKey;

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API 에러 ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('LLM이 빈 응답을 반환했다.');
  console.log(`[llm] 응답 수신 (${content.length}자)`);
  return { html: extractHtmlFromResponse(content), usingTemplate: false };
}

export function extractHtmlFromResponse(text) {
  // Any fenced block (```html, ```javascript, ``` etc.) — extract inner and validate
  const fenceMatch = text.match(/```(?:\w+)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    const block = fenceMatch[1].trim();
    if (!/<\s*(div|p|table)\b/i.test(block)) {
      throw new Error('LLM 응답의 코드 블록에서 유효한 HTML 구조(div/p/table)를 찾을 수 없습니다');
    }
    // Reject any prose outside fence? inner already isolated, ensure no fence markers remain
    if (/```/.test(block)) throw new Error('LLM 응답의 코드 블록에서 유효한 HTML 구조(div/p/table)를 찾을 수 없습니다');
    return block;
  }
  // Unclosed or stray fence marker is a hard failure — do not leak markdown
  if (/```/.test(text)) {
    throw new Error('LLM 응답에 마크다운 코드펜스(```)가 남아 있다');
  }
  // Extract only HTML fragment from first structural tag, stripping leading prose
  const htmlStart = text.search(/<\s*(div|p|table)\b/i);
  if (htmlStart === -1) {
    throw new Error('LLM 응답에서 유효한 HTML 구조(div/p/table)를 찾을 수 없습니다');
  }
  const fragment = text.slice(htmlStart).trim();
  if (!fragment) throw new Error('LLM이 빈 응답을 반환했다');
  if (!/<\s*(div|p|table)\b/i.test(fragment)) {
    throw new Error('LLM 응답에서 유효한 HTML 구조(div/p/table)를 찾을 수 없습니다');
  }
  // Prefer full <div>...</div> wrapper if present, otherwise return fragment from first tag
  const divMatch = fragment.match(/(<div[\s\S]*<\/div>)/i);
  if (divMatch) return divMatch[1];
  // Strip trailing non-HTML prose after last closing tag
  const tail = fragment.slice(fragment.lastIndexOf('>') + 1).trim();
  if (tail && tail.length && !tail.startsWith('<')) {
    const m = fragment.match(/^([\s\S]*<\/\s*(div|p|table|h[1-3]|ul|ol|blockquote|figure)\s*>)[^<]*$/i);
    if (m) return m[1].trim();
    // fallback: truncate to last '>' if tail is pure prose
    const lastCloseIdx = fragment.lastIndexOf('</');
    if (lastCloseIdx !== -1) {
      const end = fragment.indexOf('>', lastCloseIdx);
      if (end !== -1) return fragment.slice(0, end + 1).trim();
    }
  }
  return fragment;
}

// ─── runId 생성/캐시 (배치 내 동일 runId 유지, queue 상관용) ─────────────
let _cachedBatchRunId = null;
export function getOrCreateRunId({ date = null, env = process.env } = {}) {
  if (env.RUN_ID) return String(env.RUN_ID);
  if (_cachedBatchRunId) return _cachedBatchRunId;
  const d = date || todayLocalDate();
  _cachedBatchRunId = `generate-${d}-${Date.now()}`;
  return _cachedBatchRunId;
}
export function clearCachedRunId() { _cachedBatchRunId = null; }

// ─── 유틸 ────────────────────────────────────────────────────────────

// auto-queue.mjs와 동일한 "서버 로컬 날짜" 포맷 (YYYY-MM-DD).
// 서버 시간대(CEST 등)에서 toISOString()은 UTC 날짜를 반환해 자정~오전 실행 시
// 생성 폴더/큐 날짜가 어긋나는 버그가 있었다.
function todayLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ─── 이미지 생성 ─────────────────────────────────────────────────────

async function generateThumbnail(context) {
  const result = await acquireRepresentativeImage(context, {
    outDir: path.join(OUTPUT_DIR, 'images')
  });
  if (result.ok) {
    console.log(`[image] ${result.method} 적용 완료: ${result.path}`);
    return result;
  }

  // PIL은 명시적으로 켠 경우에만 사용한다. 기본 경로에서 부적합한
  // 범용 이미지를 조용히 적용해 발행하는 일을 막는다.
  if (process.env.IMAGE_ALLOW_PIL_FALLBACK === '1') {
    const outPath = path.join(OUTPUT_DIR, 'images', `${context.id || 'post'}-${Date.now()}.png`);
    console.warn('[image] Google/Imagen 실패 — 명시적 PIL emergency fallback 사용');
    const pilPath = await generatePilThumbnail(context, outPath);
    if (pilPath) {
      const checked = await validateImageFile(pilPath);
      if (checked.ok) {
        const provenance = {
          method: 'pil-emergency',
          status: 'needs_review',
          query: result.query,
          generatedAt: new Date().toISOString(),
          license: 'locally-generated-fallback',
          licenseVerified: true,
          width: checked.width,
          height: checked.height,
          bytes: checked.bytes
        };
        const provenancePath = await writeImageProvenance(pilPath, provenance);
        return { ok: true, status: 'needs_review', method: 'pil-emergency', path: pilPath, provenancePath, query: result.query, provenance };
      }
    }
  }

  throw new Error(`[image] 적합한 대표 이미지 확보 실패: ${result.errors.join(' | ')}`);
}


async function generatePilThumbnail(context, outPath) {
  const pyCode = `
from PIL import Image, ImageDraw, ImageFont
import sys

W, H = 1536, 1024
dark_bg = '#0a1628'
teal = '#2de2e6'
white = '#f0f8ff'
accent = '#7af4fc'

img = Image.new('RGB', (W, H), dark_bg)
draw = ImageDraw.Draw(img)

# Gradient background
for y in range(H):
    t = y / (H - 1)
    r = int(10 + (17 - 10) * t)
    g = int(22 + (29 - 22) * t)
    b = int(40 + (51 - 40) * t)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Grid lines
for x in range(0, W, 60):
    draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 8), width=1)
for y in range(0, H, 60):
    draw.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)

# Decorative boxes
boxes = [
    (80, 120, 300, 180, '#1a2d4a', teal),
    (420, 200, 280, 160, '#1a3d5a', accent),
    (740, 100, 320, 200, '#0d2137', teal),
    (1100, 180, 260, 140, '#1a2d4a', accent),
    (200, 400, 360, 120, '#0d2137', teal),
    (620, 450, 300, 100, '#1a3d5a', accent),
    (960, 380, 280, 160, '#1a2d4a', teal),
]
for x, y, w, h, bg, outline in boxes:
    draw.rounded_rectangle((x, y, x+w, y+h), radius=10, fill=bg, outline=outline, width=2)

# Connection lines
lines = [(230, 300, 560, 280), (560, 280, 900, 200), (900, 200, 1230, 250),
         (380, 460, 770, 500), (770, 500, 1100, 460)]
for x1, y1, x2, y2 in lines:
    draw.line([(x1, y1), (x2, y2)], fill=teal + '40', width=2)
    # Arrow dots
    draw.ellipse((x2-4, y2-4, x2+4, y2+4), fill=teal)

# Title area
try:
    font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
except:
    font_large = ImageFont.load_default()
    font_small = ImageFont.load_default()

# Category pill
cat = "${(context.category || 'TECH').slice(0, 6)}"
bbox = draw.textbbox((0, 0), cat, font=font_small)
pill_w = bbox[2] - bbox[0] + 30
draw.rounded_rectangle((80, H-120, 80+pill_w, H-70), radius=20, fill=teal)
draw.text((95, H-115), cat, fill=dark_bg, font=font_small)

# Keyword text
kw = "${(context.keyword || '').slice(0, 20)}"
draw.text((80, H-55), kw, fill=white, font=font_small)

img.save("${outPath}")
print("${outPath}")
`;

  try {
    const result = execSync(`python3 -c '${pyCode.replace(/'/g, "'\\''")}'`, {
      timeout: 15000,
      stdio: 'pipe',
      encoding: 'utf8'
    });
    const savedPath = result.trim().split('\n').pop();
    if (savedPath && await fs.access(savedPath).then(() => true).catch(() => false)) {
      console.log(`[image] PIL 생성 완료: ${savedPath}`);
      return savedPath;
    }
  } catch (e) {
    console.error(`[image] PIL 실패: ${e.message}`);
  }
  return '';
}

// ─── HTML 저장 + 메타 정보 ──────────────────────────────────────────

async function savePost(context, htmlContent, thumbnailResult, usingTemplate = false) {
  const imageResult = typeof thumbnailResult === 'string'
    ? { ok: true, status: 'ready', method: 'legacy', path: thumbnailResult }
    : (thumbnailResult || null);
  const thumbnailPath = imageResult?.path || '';
  const today = todayLocalDate();
  const slug = context.keyword
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const postDir = path.join(OUTPUT_DIR, today);
  await fs.mkdir(postDir, { recursive: true });

  const htmlPath = path.join(postDir, `${slug}.html`);
  const metaPath = path.join(postDir, `${slug}.meta.json`);

  await fs.writeFile(htmlPath, htmlContent, 'utf8');

  const extractedTitle = extractTitle(htmlContent, context.keyword);
  const seoTitle = extractedTitle && extractedTitle.length >= 12
    ? extractedTitle
    : `${context.keyword} 완벽 정리 가이드`;
  const selectedTemplate = selectTemplate({
    seed: context.templateSeed || context.id || context.keyword,
    templateId: context.templateId
  });
  const meta = {
    id: context.id || `gen-${Date.now()}`,
    keyword: context.keyword,
    category: context.category,
    tags: context.tags || [],
    contentType: context.contentType || 'guide',
    templateId: selectedTemplate.id,
    templateLabel: selectedTemplate.label,
    templateSeed: context.templateSeed || context.id || context.keyword || '',
    cpcTier: context.cpcTier || 'B',
    ymylRisk: context.ymylRisk || 'none',
    sourceBundle: context.sourceBundle || [],
    title: seoTitle,
    description: extractDescription(htmlContent, context.description),
    bodyFile: htmlPath,
    thumbnail: thumbnailPath || '',
    imageRequired: context.imageRequired !== false,
    image: imageResult?.provenance
      ? { ...imageResult.provenance, path: thumbnailPath, provenancePath: imageResult.provenancePath || null }
      : null,
    runId: context.runId || context.metaRunId || getOrCreateRunId({ date: today }),
    metaRunId: context.runId || context.metaRunId || getOrCreateRunId({ date: today }),
    generatedAt: new Date().toISOString(),
    usingTemplate,
    status: 'generated'
  };

  // 발행 전 QA (스킬 + 웹 시장 리서치 + provenance)
  const qa = await qaHtmlPostWithMarket(htmlContent, {
    title: meta.title,
    keyword: context.keyword || '',
    category: context.category || '',
    contentType: context.contentType || 'guide',
    ymylRisk: context.ymylRisk || meta.ymylRisk || 'none',
    sourceBundle: context.sourceBundle || meta.sourceBundle || [],
    market: context.market || null,
    imageRequired: meta.imageRequired,
    marketResearch: true,
    notifyDiscord: false
  });
  const qaPath = path.join(postDir, `${slug}.qa.json`);
  await writeQaReport(qaPath, qa);
  meta.qa = {
    ok: qa.ok,
    score: qa.score,
    failures: qa.failures,
    warnings: qa.warnings,
    metrics: qa.metrics,
    suggestions: qa.suggestions || [],
    market: qa.market || null,
    provenance: qa.provenance || null,
    reportFile: qaPath
  };
  meta.market = context.market || qa.market || null;
  meta.provenance = qa.provenance || null;
  // 템플릿 fallback과 검토 필요 이미지 모두 자동 발행 금지.
  if (usingTemplate || imageResult?.status === 'needs_review') {
    meta.status = 'draft_only';
    meta.provenance = { verdict: 'fail', reason: usingTemplate ? 'template-fallback' : 'image-needs-review' };
  } else {
    meta.status = qa.ok ? 'qa_passed' : 'qa_failed';
  }

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  console.log(`[save] HTML: ${htmlPath}`);
  console.log(`[save] META: ${metaPath}`);
  console.log(`[qa] ${qa.ok ? 'PASS' : 'FAIL'} score=${qa.score}${usingTemplate ? ' (template draft_only)' : ''}`);
  for (const f of qa.failures || []) console.log(`  - FAIL ${f.code}: ${f.message}`);
  for (const w of qa.warnings || []) console.log(`  - WARN ${w.code}: ${w.message}`);

  if (qa.ok && usingTemplate) {
    console.log(`  ⚠ 템플릿 fallback — draft_only로 저장, 자동 큐에서 제외`);
    return meta;
  }
  if (!qa.ok) {
    for (const s of (qa.suggestions || []).slice(0, 5)) console.log(`  - TODO ${s}`);
    throw new Error(`QA 실패: ${meta.title || context.keyword} (${(qa.failures || []).map(f => f.code).join(', ')})`);
  }

  return meta;
}

function extractTitle(html, fallback) {
  const strip = (s) => String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/^[^\w가-힣A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = strip(h1[1]);
    if (t) return t.slice(0, 80);
  }
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2) {
    const t = strip(h2[1]);
    if (t) return t.slice(0, 80);
  }
  return fallback || '제목 없음';
}

function extractDescription(html, fallback) {
  const pMatch = html.match(/<p[^>]*>([^<]{20,})<\/p>/);
  if (pMatch) return pMatch[1].slice(0, 120);
  return fallback || '';
}

// ─── 큐 등록 ────────────────────────────────────────────────────────

function buildQueueEntry(meta, timeSlot) {
  const today = todayLocalDate();
  return {
    id: meta.id,
    runId: meta.runId || meta.metaRunId || getOrCreateRunId({ date: today }),
    publishAt: `${today}T${timeSlot}:00+09:00`,
    blogUrl: 'https://acstory.tistory.com',
    title: meta.title,
    bodyHtml: '', // HTML 파일 경로를 bodyFile로 전달
    bodyFile: meta.bodyFile,
    description: meta.description,
    category: meta.category,
    tags: Array.isArray(meta.tags) ? meta.tags.join(',') : (meta.tags || ''),
    heroImage: meta.thumbnail || '',
    image: meta.image || null,
    imageRequired: meta.imageRequired !== false,
    templateId: meta.templateId || '',
    sourceBundle: Array.isArray(meta.sourceBundle) ? [...meta.sourceBundle] : [],
    ymylRisk: meta.ymylRisk || 'none',
    status: meta.status || 'generated'
  };
}

// ─── 상태 관리 ──────────────────────────────────────────────────────

async function loadGeneratedIds() {
  const statePath = path.join(OUTPUT_DIR, 'state.json');
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return new Set(JSON.parse(raw).generated || []);
  } catch {
    return new Set();
  }
}

async function saveGeneratedId(id) {
  const statePath = path.join(OUTPUT_DIR, 'state.json');
  let state = { generated: [] };
  try {
    state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch { /* new */ }
  if (!state.generated.includes(id)) {
    state.generated.push(id);
  }
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

// ─── 메인 ───────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const keywordsData = await loadKeywordsData();
  const keywords = keywordsData.keywords || [];
  const gateOpts = {
    focusCategories: keywordsData.focusCategories,
    allowLegacySeries: keywordsData.allowLegacySeries
  };

  if (args.list) {
    console.log(`\n사용 가능한 키워드 (${keywords.length}개):\n`);
    const generated = await loadGeneratedIds();
    for (const k of keywords) {
      const status = generated.has(k.id) ? '✓' : ' ';
      console.log(`  ${status} ${k.id.padEnd(12)} | ${k.keyword.padEnd(25)} | ${k.category} | CPC=${k.cpcTier}`);
    }
    console.log(`\n  ✓ = 이미 생성됨`);
    return;
  }

  if (args.batch) {
    const generated = await loadGeneratedIds();
    const unpublished = pickUnpublished(keywords, generated);

    // 발행 중복 게이트: 이미 블로그에 발행된 주제는 다시 생성하지 않는다.
    // state.json이 리셋되거나 ID 체계가 바뀌어도 실제 블로그 RSS가 최종 확인.
    // RSS 실패 시 원장으로만 판정(fail-open) — 발행 자체는 submit-queue에서 다시 차단.
    const gate = await buildDuplicateGate({ blogUrl: 'https://acstory.tistory.com', ledgerPath: PUBLISHED_LEDGER_PATH, log: console.error });
    const kept = [];
    const skipped = [];
    for (const kw of unpublished) {
      const dup = isAlreadyPublished({ id: kw.id, keyword: kw.keyword }, gate);
      if (dup.matched) {
        skipped.push(kw);
        console.log(`[dup] 발행 이력과 중복 — 생성 생략: ${kw.id} (${kw.keyword}) [${dup.rule}]`);
      } else {
        kept.push(kw);
      }
    }
    if (skipped.length > 0) {
      console.log(`[dup] 중복 생략 ${skipped.length}건: ${skipped.map(k => k.id).join(', ')}`);
    }
    const recentPosts = await recentGeneratedPosts(10);
    // keywords.json의 topicCluster를 id로 보강
    const kwById = new Map(keywords.map(k => [k.id, k]));
    const recentTopicClusters = recentPosts.map(p => topicClusterOf(kwById.get(p.id) || p));
    const toProcess = rankBatchCandidates(kept, recentTopicClusters, args.count, gateOpts);

    if (toProcess.length === 0) {
      console.log('[batch] 처리할 미발행 키워드가 없다.');
      return;
    }

    console.log(`[batch] ${toProcess.length}개 키워드 처리 시작 (다양성 재순위)`);
    for (const kw of toProcess) {
      console.log(`  · ${kw.id} [${topicClusterOf(kw)}] ${kw.keyword}`);
    }
    console.log('');
    const results = [];

    for (const kw of toProcess) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[batch] ${kw.id}: ${kw.keyword}`);
      console.log(`${'='.repeat(60)}`);

      try {
        const context = {
          ...applyTemplateSelection(await researchKeyword(kw), args),
          imageRequired: !args.skipImage
        };
        console.log(`[template] ${context.templateId} — ${context.templateLabel}`);
        const { html, usingTemplate } = await generateWithLLM(context, args);

        let thumbnail = null;
        if (!args.skipImage) {
          thumbnail = await generateThumbnail(context);
        }

        const meta = await savePost(context, html, thumbnail, usingTemplate || false);
        results.push(meta);
      } catch (error) {
        console.error(`[batch] QA/생성 실패: ${kw.id} — ${error instanceof Error ? error.message : String(error)}`);
      }

      // 약간의 딜레이 (API rate limit)
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[batch] 완료: ${results.length}개 생성`);
    for (const r of results) {
      console.log(`  - ${r.keyword} → ${r.bodyFile}`);
    }
    return;
  }

  // 단일 키워드 처리
  const kw = pickKeyword(keywords, args);
  console.log(`[generate] "${kw.keyword}" (${kw.category})`);
  const context = {
    ...applyTemplateSelection(await researchKeyword(kw), args),
    imageRequired: !args.skipImage
  };
  console.log(`[template] ${context.templateId} — ${context.templateLabel}`);
  const { html, usingTemplate } = await generateWithLLM(context, args);

  let thumbnail = '';
  if (!args.skipImage) {
    thumbnail = await generateThumbnail(context);
  }

  const meta = await savePost(context, html, thumbnail, usingTemplate || false);
  await saveGeneratedId(kw.id);

  console.log(`\n[완료]`);
  console.log(`  키워드: ${meta.keyword}`);
  console.log(`  제목: ${meta.title}`);
  console.log(`  카테고리: ${meta.category}`);
  console.log(`  HTML: ${meta.bodyFile}`);
  console.log(`  이미지: ${meta.thumbnail || '(없음)'}`);

  // 큐 등록 안내
  const queueEntry = buildQueueEntry(meta, '0900');
  console.log(`\n[큐 등록] 다음 명령으로 큐에 추가:`);
  console.log(`  node scripts/schedule/queue-add.mjs \\`);
  console.log(`    --date $(date +%Y-%m-%d) --time 09:00 \\`);
  console.log(`    --title "${meta.title}" \\`);
  console.log(`    --body-file "${meta.bodyFile}" \\`);
  console.log(`    --category "${meta.category}" \\`);
  console.log(`    --tags "${meta.tags.slice(0, 5).join(',')}" \\`);
  console.log(`    --template-id "${queueEntry.templateId}"`);
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('generate-post.mjs')) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
