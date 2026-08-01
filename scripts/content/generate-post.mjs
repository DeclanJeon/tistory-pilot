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

loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'content', 'generated');
const IMAGE_GEN_SCRIPT = process.env.IMAGE_GEN
  || path.join(process.env.HOME || '/home/declan', '.codex', 'skills', '.system', 'imagegen', 'scripts', 'image_gen.py');

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

async function loadKeywords() {
  const raw = await fs.readFile(KEYWORDS_PATH, 'utf8');
  return JSON.parse(raw).keywords || [];
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
  return keywords.filter(k => !generatedIds.has(k.id));
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

  const context = {
    keyword: keyword,
    category: keywordEntry.category,
    description: keywordEntry.description || '',
    contentType: keywordEntry.contentType || 'guide',
    tags: keywordEntry.tags || [],
    cpcTier: market?.cpcTier || keywordEntry.cpcTier || 'B',
    market,
    marketPrompt: buildMarketPromptBlock(market)
  };

  return context;
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

async function buildSystemPrompt() {
  const skill = await loadTistoryBlogSkill();
  const skillBlock = skill
    ? `\n\n[tistory-blog SKILL.md 원문]\n${skill.slice(0, 12000)}\n[/tistory-blog SKILL.md]\n`
    : '';
  const curYear = new Date().getFullYear();

  return `당신은 한국어 티스토리 블로그 전문 작가다.
아래 tistory-blog 스킬 규칙을 최우선으로 따른다.
${skillBlock}

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
12. 출력은 HTML만. 설명 문장, 코드블록 감싸기 금지.

수익형 블로그 안전 규칙 (설계 문서 §3):
13. 제목/본문의 연도는 현재 연도(${curYear}) 기준으로 쓴다. 지난 연도(2025 이하)를 제목에 넣지 않는다.
14. 비용·가격·수치·기준일을 주장할 때는 반드시 근처에 (출처: …) 를 명시한다. 추정치는 "약/대략"으로 표현한다.
15. 금지 문구: 무조건 승인, 승인 보장, 가장 좋은 보험/대출, 확실히 줄이는/내리는, 소송에서 이기는, 치료 효과, 완치, 부작용 없이.
16. 금융·보험·건강·법률(YMYL) 주제는 결정을 강요하지 않고 공식 절차·서류·문의처·수수료 정보만 제공한다.
17. 비용/요금 주제(비용·가격·요금·견적·렌탈·이사·청소·설치·교체·위약금)는 항목별 가격표(<table>)와 추가요금·별도 비용 항목을 반드시 포함한다.
18. 첫 문단은 인사말이 아니라 훅으로 시작한다: 구체적 숫자, 문제 공감, 또는 질문.`;
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

  return `"${context.keyword}"에 대한 블로그 글을 작성해라.

카테고리: ${context.category}
글 유형: ${typeDesc}
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
- figure+figcaption 이미지 1개 이상
- 첫 문단에 키워드를 자연스럽게 포함
- 마지막에 핵심 정리 섹션을 반드시 완성한다
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
  const systemPrompt = await buildSystemPrompt();
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
    return generateWithOpenAI(systemPrompt, userPrompt, args);
  }
  console.log('[llm] LLM 없음 — 템플릿 모드로 생성');
  return generateFromTemplate(context);
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
      return extractHtmlFromResponse(output);
    }
  } catch (e) {
    console.error(`[hermes] CLI 실패: ${e.message.split('\n')[0]}`);
  }

  console.log(`[hermes] 수동 실행이 필요하다:`);
  console.log(`  hermes -z "$(cat '${promptFile}')" > output.html`);
  return generateFromTemplate(context);
}

async function generateWithOpenAI(systemPrompt, userPrompt, args) {
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
    return generateFromTemplate({ keyword: '' });
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
  return extractHtmlFromResponse(content);
}

function extractHtmlFromResponse(text) {
  // 코드 블록 안의 HTML 추출
  const codeBlockMatch = text.match(/```(?:html)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // div 태그로 시작하는 HTML 추출
  const divMatch = text.match(/(<div[\s\S]*<\/div>)/);
  if (divMatch) return divMatch[1];

  // 그 외에는 전체 텍스트를 HTML로 간주
  return text.trim();
}

// ─── 템플릿 기반 생성 (LLM 없을 때) ────────────────────────────────

function generateFromTemplate(context) {
  const today = new Date().toISOString().slice(0, 10);
  const keyword = context.keyword;
  const category = context.category;
  const tags = (context.tags || []).slice(0, 5).join(', ');

  return `<div style="font-size:16px;line-height:1.82;color:#1f2937;">

<p style="margin:0.8rem 0;">${keyword}에 대해 정리했다.</p>

<div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:1rem 1.2rem;margin:1.5rem 0;font-size:15px;">
💡 <strong>이 글은 ${keyword}의 핵심 개념과 실전 방법을 다룬다.</strong>
</div>

<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
📖 ${keyword}이란?
</h2>

<p style="margin:0.8rem 0;">${context.description || `${keyword}에 대한 상세한 설명이 들어갑니다.`}</p>

<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
⚙️ 핵심 포인트
</h2>

<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:0.8rem 1.2rem;margin:1rem 0;border-radius:0 8px 8px 0;font-size:15px;">
<strong>첫 번째 포인트:</strong> 상세한 설명이 들어간다.
</div>

<p style="margin:0.8rem 0;">추가 설명이 이어진다.</p>

<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
⚖️ 비교 분석
</h2>

<div style="overflow-x:auto;margin:1.5rem 0;">
<table style="width:100%;border-collapse:collapse;font-size:15px;">
<thead>
<tr style="background:#1f2937;color:#fff;">
<th style="padding:10px 16px;text-align:left;">항목</th>
<th style="padding:10px 16px;text-align:left;">상세</th>
</tr>
</thead>
<tbody>
<tr style="background:#f8fafc;">
<td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;">항목 1</td>
<td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;">설명</td>
</tr>
</tbody>
</table>
</div>

<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
💡 실전 팁
</h2>

<p style="margin:0.8rem 0;">실제 활용 방법과 주의사항을 정리한다.</p>

<div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:1rem 1.2rem;margin:1.5rem 0;font-size:15px;">
⚠️ <strong>주의:</strong> 실제 정보로 교체해야 한다.
</div>

<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
📌 마무리
</h2>

<p style="margin:0.8rem 0;">${keyword}의 핵심을 다시 한번 정리했다.</p>

<blockquote style="border-left:3px solid #d1d5db;padding:0.8rem 1.2rem;margin:1.5rem 0;color:#4b5563;font-style:italic;background:#f9fafb;border-radius:0 8px 8px 0;">
${keyword}에 대해 더 알고 싶다면 위의 포인트들을 참고하라.
</blockquote>

<p style="margin:1.5rem 0 0.5rem;font-size:14px;color:#6b7280;">
#tags
</p>

</div>`.replace('#tags', (context.tags || ['#' + keyword.replace(/\s+/g, '')]).map(t => t.startsWith('#') ? t : '#' + t.replace(/\s+/g, '')).join(' '));
}

// ─── 이미지 생성 ─────────────────────────────────────────────────────

async function generateThumbnail(context) {
  const outDir = path.join(OUTPUT_DIR, 'images');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${context.id || 'post'}-${Date.now()}.png`);

  // image_gen CLI가 있으면 사용
  const imageGenScript = IMAGE_GEN_SCRIPT;
  const hasImageGen = await fs.access(imageGenScript).then(() => true).catch(() => false);
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

  if (hasImageGen && hasOpenAIKey) {
    console.log('[image] Codex Imagen으로 대표 이미지 생성...');
    const prompt = buildImagePrompt(context);
    try {
      execSync(`python "${imageGenScript}" generate --prompt "${prompt.replace(/"/g, '\\"')}" --quality medium --size 1536x1024 --out "${outPath}" --force`, {
        timeout: 60000,
        stdio: 'pipe'
      });
      if (await fs.access(outPath).then(() => true).catch(() => false)) {
        console.log(`[image] 생성 완료: ${outPath}`);
        return outPath;
      }
    } catch (e) {
      console.error(`[image] Imagen 실패: ${e.message}`);
    }
  }

  // PIL 폴백
  console.log('[image] PIL로 대표 이미지 생성...');
  return generatePilThumbnail(context, outPath);
}

function buildImagePrompt(context) {
  const categoryStyles = {
    '투자·재테크': 'Professional financial infographic, clean white background, blue (#3b82f6) and green (#10b981) accent colors, upward trending elements, modern flat design',
    'IT·테크': 'Clean minimalist tech illustration, dark navy background (#0a1628), teal accent lines (#2de2e6), abstract network/connection nodes, modern design',
    '생활·정보': 'Warm friendly lifestyle illustration, soft pastel colors, clean modern design, relevant iconography',
    '개발지식': 'Clean minimalist tech diagram, dark theme, teal accent, code/algorithm visualization',
    '개발 회고': 'Warm retrospective illustration, timeline/roadmap elements, soft colors'
  };
  const style = categoryStyles[context.category] || categoryStyles['IT·테크'];
  return `${style}, 1536x1024, blog thumbnail, no text, no logos, no watermark`;
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

async function savePost(context, htmlContent, thumbnailPath) {
  const today = new Date().toISOString().slice(0, 10);
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
  const meta = {
    id: context.id || `gen-${Date.now()}`,
    keyword: context.keyword,
    category: context.category,
    tags: context.tags || [],
    contentType: context.contentType || 'guide',
    cpcTier: context.cpcTier || 'B',
    title: seoTitle,
    description: extractDescription(htmlContent, context.description),
    bodyFile: htmlPath,
    thumbnail: thumbnailPath || '',
    generatedAt: new Date().toISOString(),
    status: 'generated'
  };

  // 발행 전 QA (스킬 + 웹 시장 리서치)
  const qa = await qaHtmlPostWithMarket(htmlContent, {
    title: meta.title,
    keyword: context.keyword || '',
    category: context.category || '',
    market: context.market || null,
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
    reportFile: qaPath
  };
  meta.market = qa.market || context.market || null;
  meta.status = qa.ok ? 'qa_passed' : 'qa_failed';

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  console.log(`[save] HTML: ${htmlPath}`);
  console.log(`[save] META: ${metaPath}`);
  console.log(`[qa] ${qa.ok ? 'PASS' : 'FAIL'} score=${qa.score}`);
  for (const f of qa.failures || []) console.log(`  - FAIL ${f.code}: ${f.message}`);
  for (const w of qa.warnings || []) console.log(`  - WARN ${w.code}: ${w.message}`);

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
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: meta.id,
    publishAt: `${today}T${timeSlot}:00+09:00`,
    blogUrl: 'https://acstory.tistory.com',
    title: meta.title,
    bodyHtml: '', // HTML 파일 경로를 bodyFile로 전달
    bodyFile: meta.bodyFile,
    description: meta.description,
    category: meta.category,
    tags: Array.isArray(meta.tags) ? meta.tags.join(',') : (meta.tags || ''),
    heroImage: meta.thumbnail || ''
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

  const keywords = await loadKeywords();

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
    const toProcess = unpublished.slice(0, args.count);

    if (toProcess.length === 0) {
      console.log('[batch] 처리할 미발행 키워드가 없다.');
      return;
    }

    console.log(`[batch] ${toProcess.length}개 키워드 처리 시작\n`);
    const results = [];

    for (const kw of toProcess) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[batch] ${kw.id}: ${kw.keyword}`);
      console.log(`${'='.repeat(60)}`);

      try {
        const context = await researchKeyword(kw);
        const html = await generateWithLLM({ ...context, id: kw.id }, args);

        let thumbnail = '';
        if (!args.skipImage) {
          thumbnail = await generateThumbnail({ ...context, id: kw.id });
        }

        const meta = await savePost({ ...context, id: kw.id }, html, thumbnail);
        await saveGeneratedId(kw.id);
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

  const context = await researchKeyword(kw);
  const html = await generateWithLLM({ ...context, id: kw.id }, args);

  let thumbnail = '';
  if (!args.skipImage) {
    thumbnail = await generateThumbnail({ ...context, id: kw.id });
  }

  const meta = await savePost({ ...context, id: kw.id }, html, thumbnail);
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
  console.log(`    --tags "${meta.tags.slice(0, 5).join(',')}"`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
