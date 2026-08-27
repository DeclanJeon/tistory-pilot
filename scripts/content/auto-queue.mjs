#!/usr/bin/env node
/**
 * auto-queue.mjs — 생성된 글을 읽어서 큐에 자동 등록 (설계 문서 §5)
 *
 * content/generated/YYYY-MM-DD/ 디렉토리의 .meta.json 파일을 읽고,
 * 1) 발행 전 QA 게이트 (qaMetaPost)
 * 2) 선택: 하드 게이트(YMYL/주제) + selectionScore
 *    (= 45% 상업의도 + 25% QA + 20% SERP 갭 + 10% 신선도) + 믹스 50/30/20
 *    ±10%p + 부트스트랩 일 캡
 * 3) 시간대별 분배 → scheduled/queue/ 등록
 *
 * 사용법:
 *   node scripts/content/auto-queue.mjs
 *   node scripts/content/auto-queue.mjs --date 2026-07-28
 *   node scripts/content/auto-queue.mjs --dry-run
 *   node scripts/content/auto-queue.mjs --max-posts 3
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { qaMetaPost } from './qa-post.mjs';
import { scoreKeyword, computeSelectionScore, freshnessFactor, normalizeGapScore, topicClusterOf, topicDiversityFactor, applyTopicDiversity } from './keyword-score.mjs';
import { recentGeneratedPosts, mixBucket } from './select-keywords.mjs';
import { buildDuplicateGate, isAlreadyPublished } from '../lib/published-posts.mjs';
import { readCache, applyMeasuredMetricsToCandidates } from './metrics-injector.mjs';
import { isWeatherTriggered } from './seasonal-bridge.mjs';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'content', 'generated');
// 서버는 /srv/publish-workbench/scheduled/queue, 로컬은 프로젝트 scheduled/queue
const QUEUE_DIR = process.env.SCHEDULED_QUEUE_DIR
  || (existsSync('/srv/publish-workbench/scheduled/queue')
    ? '/srv/publish-workbench/scheduled/queue'
    : path.join(PROJECT_ROOT, 'scheduled', 'queue'));
const PUBLISHED_LEDGER_PATH = process.env.PUBLISHED_LEDGER_PATH
  || path.join(PROJECT_ROOT, 'content', 'published.json');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');

const TIME_SLOTS = ['0700', '0900', '1200', '1400', '1700', '2000', '2200'];
const SLOT_MAX = { '0700': 2, '0900': 3, '1200': 2, '1400': 2, '1700': 3, '2000': 2, '2200': 1 };

// 애드센스 승인 후 운영 정책: 일일 생성·발행 상한 15건
const DAILY_MAX_POSTS = 15;
// 설계 §3: 최근 10건 기준 믹스 50/30/20 ±10%p
const MIX_TARGET = { '비용': 50, '절차': 30, '문제해결': 20 };
const MIX_TOLERANCE_PP = 10;
const LEGACY_CAP_RATIO = 0.2; // 레거시 시리즈(정보·기타)는 전체의 20% 상한

function parseArgs(argv) {
  const args = { date: '', dryRun: false, maxPosts: DAILY_MAX_POSTS };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i + 1]) { args.date = argv[++i]; }
    else if (argv[i] === '--dry-run') { args.dryRun = true; }
    else if (argv[i] === '--max-posts' && argv[i + 1]) { args.maxPosts = Number(argv[++i]) || DAILY_MAX_POSTS; }
    else if (argv[i] === '--help') {
      console.log(`사용법: node auto-queue.mjs [--date YYYY-MM-DD] [--dry-run] [--max-posts N]`);
      process.exit(0);
    }
  }
  if (!args.date) {
    const now = new Date();
    args.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return args;
}

function normalizeBodyFile(bodyFile = '') {
  const raw = String(bodyFile || '');
  if (!raw) return '';
  // 절대 경로면 프로젝트 루트 이후를 상대 경로로 변환 (서버 배포 호환)
  if (path.isAbsolute(raw)) {
    const rel = path.relative(PROJECT_ROOT, raw);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
  }
  return raw.replace(/\\/g, '/');
}

async function findGeneratedPosts(date) {
  const dayDir = path.join(GENERATED_DIR, date);
  try {
    const files = await fs.readdir(dayDir);
    const metas = [];
    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      const raw = await fs.readFile(path.join(dayDir, f), 'utf8');
      const meta = JSON.parse(raw);
      // QA 통과 글만 큐 등록 대상 (draft_only는 템플릿 fallback — 자동 발행 금지)
      if (meta.status === 'qa_failed' || meta.status === 'draft_only') continue;
      if (meta.usingTemplate === true) continue;
      if (meta.status === 'generated' || meta.status === 'qa_passed' || !meta.status) {
        metas.push(meta);
      }
    }
    return metas;
  } catch {
    return [];
  }
}

async function loadExistingQueue(date) {
  const queueFile = path.join(QUEUE_DIR, `${date}.json`);
  try {
    const raw = await fs.readFile(queueFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { posts: [] };
  }
}

async function saveQueue(date, queueData) {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const queueFile = path.join(QUEUE_DIR, `${date}.json`);
  await fs.writeFile(queueFile, JSON.stringify(queueData, null, 2) + '\n', 'utf8');
  return queueFile;
}

async function loadKeywords() {
  const raw = await fs.readFile(KEYWORDS_PATH, 'utf8');
  return JSON.parse(raw);
}

// ─── 날씨 트리거 활성 목록 해석 ─────────────────────────────────────────
// 우선순위: 1) 환경변수 WEATHER_ACTIVE_TRIGGERS/ACTIVE_WEATHER_TRIGGERS (콤마 구분)
//          2) content/learning/shadow-sources-<today>.json 의 kma-weather items
//          3) 빈 배열 (부스팅 없음, 실패를 0으로 치환 금지)
export function parseActiveWeatherTriggers(env = process.env) {
  const primary = String(env.WEATHER_ACTIVE_TRIGGERS || '').trim();
  const alias = String(env.ACTIVE_WEATHER_TRIGGERS || '').trim();
  for (const raw of [primary, alias]) {
    if (!raw) continue;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts;
  }
  return [];
}
export async function loadActiveWeatherTriggers({ env = process.env, date = null } = {}) {
  const fromEnv = parseActiveWeatherTriggers(env);
  if (fromEnv.length) return fromEnv;
  // Shadow 파일에서 kma-weather 트리거 추출 시도 (없으면 빈 배열)
  try {
    const d = date || new Date().toISOString().slice(0, 10);
    const candidates = [
      path.join(PROJECT_ROOT, 'content', 'learning', `shadow-sources-${d}.json`),
      path.join(PROJECT_ROOT, 'content', 'learning', 'shadow-sources.json'),
    ];
    for (const p of candidates) {
      try {
        const raw = await fs.readFile(p, 'utf8');
        const data = JSON.parse(raw);
        const sources = data.sources || data.snapshot || data;
        // aggregator snapshot: data.sourceStatus + merged, 또는 validateSourceResult 배열
        // kma-weather 어댑터는 items[].normalized 또는 raw를 trigger로 반환
        if (Array.isArray(sources)) {
          for (const s of sources) {
            if (s.source === 'kma-weather' && Array.isArray(s.items)) {
              const trigs = s.items.map(i => i.normalized || i.raw).filter(Boolean);
              if (trigs.length) return trigs;
            }
          }
        }
        if (sources && typeof sources === 'object' && sources['kma-weather']) {
          // sourceStatus 형태가 아니면 스킵
        }
        // snapshot.sources 배열 탐색
        const snapSources = data.snapshot?.sources || data.sources?.sources || [];
        if (Array.isArray(snapSources)) {
          for (const s of snapSources) {
            if (s.source === 'kma-weather' && Array.isArray(s.items)) {
              const trigs = s.items.map(i => i.normalized || i.raw).filter(Boolean);
              if (trigs.length) return trigs;
            }
          }
        }
        // merged items에 trigger 플래그가 있으면 키 추출 (fallback)
        const merged = data.merged || data.snapshot?.merged || [];
        if (Array.isArray(merged)) {
          const trigs = merged.filter(m => m.trigger).map(m => m.normalized || m.raw).filter(Boolean);
          if (trigs.length) return trigs;
        }
      } catch {}
    }
  } catch {}
  return [];
}


// ─── 선택 단계 (설계 §5) ──────────────────────────────────────────────

// 믹스 게이트: 최근 10건 + 이번 선택분 합산 비중이 목표 ±10%p를 넘는 유형은
// 후순위로 미룬다. 전부 막히면(완전 정지 방지) 점수순으로 캡까지 채운다.
// 유형 분류는 keywords.json의 contentType(정규 값) 기준 — generate-post가
// meta에 임의로 넣은 값(guide/calculator 등)은 신뢰하지 않는다.
export function enforceMix(candidates, recentPosts, kwById, cap) {
  const selected = [];
  const deferred = [];
  const recentCount = {};
  for (const p of recentPosts) {
    const kw = kwById.get(p.id);
    const b = mixBucket(kw?.contentType || p.contentType);
    recentCount[b] = (recentCount[b] || 0) + 1;
  }
  const selectedCount = {};
  const denomBase = Math.max(1, recentPosts.length);

  const pushDeferred = (c, reason) => deferred.push({ ...c, reason });

  for (const c of candidates) {
    if (selected.length >= cap) { pushDeferred(c, '일일 발행 캡 초과'); continue; }
    const b = mixBucket(c.kw.contentType);
    const projected = (recentCount[b] || 0) + (selectedCount[b] || 0) + 1;
    const denom = denomBase + selected.length + 1;
    const ratio = projected / denom;
    if (b === '정보·기타') {
      if (ratio > LEGACY_CAP_RATIO) { pushDeferred(c, '레거시 시리즈 비중 상한 초과'); continue; }
    } else {
      const target = MIX_TARGET[b];
      if (target !== undefined && ratio > (target + MIX_TOLERANCE_PP) / 100) {
        pushDeferred(c, `${b} 유형 목표 비중 초과(${Math.round(ratio * 100)}%)`);
        continue;
      }
    }
    selected.push(c);
    selectedCount[b] = (selectedCount[b] || 0) + 1;
  }

  const filled = selected.length;
  for (const d of deferred) {
    if (selected.length >= cap) break;
    if (d.reason.startsWith('일일 발행 캡')) break; // 캡 초과분은 절대 채우지 않는다
    selected.push(d);
  }
  if (selected.length > filled) {
    console.log(`  [warn] 믹스 제약 완화로 ${selected.length - filled}건 추가 채움`);
  }
  return { selected, rejectedMix: deferred };
}
async function selectPosts(qaResults, keywordsData, { maxPosts = DAILY_MAX_POSTS, activeWeatherTriggers = null, weatherActiveTriggers = null, activeTriggers = null } = {}) {
  // Phase 5: 실측 캐시 hit 시 bid/volume 직접 반영 (없으면 기존 유지, 실패를 0으로 치환 금지)
  let keywordsForScoring = keywordsData.keywords || [];
  try {
    const cache = await readCache();
    if (cache && cache.metrics && Object.keys(cache.metrics).length > 0) {
      const enriched = applyMeasuredMetricsToCandidates(keywordsForScoring, cache);
      // enriched가 원본과 다른 경우(측정 반영) 반영, 아니면 원본 유지
      if (Array.isArray(enriched) && enriched.length === keywordsForScoring.length) {
        const hasMeasured = enriched.some((k) => k && k._measured && k._measured.kind === 'measured');
        // 측정 히트가 있으면 enriched 사용, 없으면 원본 유지(기존 동작 보장)
        if (hasMeasured) keywordsForScoring = enriched;
      }
    }
  } catch {
    // 캐시 읽기 실패 시 기존 경로 유지 (외부 키 없이도 35/35 통과)
  }
  const kwById = new Map(keywordsForScoring.map(k => [k.id, k]));
  const focus = keywordsData.focusCategories;
  const allowLegacy = keywordsData.allowLegacySeries;
  const rejected = [];
  const candidates = [];

  const recent = (await recentGeneratedPosts(10)).filter(p => kwById.get(p.id)?.enabled);
  const recentClusters = recent.map(p => topicClusterOf(kwById.get(p.id) || p));
  // 날씨 트리거 활성 목록 해석 (환경변수/Shadow 파일, 실패 시 빈 배열 — 0으로 치환 금지)
  let weatherTriggers = activeWeatherTriggers ?? weatherActiveTriggers ?? activeTriggers;
  if (weatherTriggers == null) {
    try {
      weatherTriggers = await loadActiveWeatherTriggers({ date: keywordsData._queueDate || null });
    } catch {
      weatherTriggers = [];
    }
  }
  if (!Array.isArray(weatherTriggers)) weatherTriggers = [];

  for (const { post, report } of qaResults) {
    const kw = kwById.get(post.id);
    if (!kw) { rejected.push({ post, reason: 'keywords.json에 없는 키워드 id' }); continue; }
    const r = scoreKeyword(kw, { focusCategories: focus, allowLegacySeries: allowLegacy });
    if (!r.gates.ymyl.allowed) { rejected.push({ post, reason: `YMYL 게이트: ${r.gates.ymyl.reason}` }); continue; }
    if (!r.gates.focus.allowed) { rejected.push({ post, reason: `주제 게이트: ${r.gates.focus.reason}` }); continue; }
    if (!kw.enabled) { rejected.push({ post, reason: 'keywords.json enabled=false' }); continue; }

    // 갭은 0~26 raw → 0~20 정규화 (selectionScore 계약)
    const gapScore = normalizeGapScore(kw.gap);
    // 신선도는 글 생성일 기준 (설계 §5). 없으면 키워드 조사일 폴백.
    const freshness = freshnessFactor(post.generatedAt || kw.metrics?.checkedAt || kw.researchedAt, new Date(), 14);
    const measuredBonus = (kw && kw._measured && Number.isFinite(kw._measured.bonus)) ? kw._measured.bonus : 0;
    const keywordText = kw.keyword || post.keyword || '';
    const weatherTriggered = isWeatherTriggered(keywordText, weatherTriggers);
    const baseScore = computeSelectionScore({
      commercialIntentScore: r.score.intent,
      qaScore: report.score,
      serpGapScore: gapScore,
      freshness,
      measuredBonus,
      weatherTriggered
    });
    const cluster = topicClusterOf(kw);
    const diversity = topicDiversityFactor(cluster, recentClusters);
    candidates.push({
      post,
      kw,
      qaScore: report.score,
      gapTotal: gapScore,
      freshness,
      topicCluster: cluster,
      diversity,
      baseScore,
      weatherTriggered,
      selectionScore: applyTopicDiversity(baseScore, diversity)
    });
  }

  candidates.sort((a, b) => b.selectionScore - a.selectionScore || (b.kw.score?.total || 0) - (a.kw.score?.total || 0));

  // 한 배치 안에서도 같은 소주제가 연속으로 고르이지 않게, 선정 누적 클러스터로 재가중
  const { selected, rejectedMix } = enforceMix(
    rerankWithBatchDiversity(candidates, maxPosts),
    recent,
    kwById,
    maxPosts
  );
  return { selected, rejected, rejectedMix };
}

// 점수순 greedy + 배치 내 소주제 다양성 재가중. enforceMix 입력 순서를 결정한다.
export function rerankWithBatchDiversity(candidates, cap = DAILY_MAX_POSTS) {
  const remaining = [...candidates];
  const ordered = [];
  const batchClusters = [];
  const limit = Math.min(remaining.length, Math.max(cap * 3, cap)); // 믹스 defer 여유분
  while (remaining.length && ordered.length < limit) {
    remaining.sort((a, b) => {
      const da = applyTopicDiversity(a.baseScore ?? a.selectionScore, topicDiversityFactor(a.topicCluster || topicClusterOf(a.kw), batchClusters));
      const db = applyTopicDiversity(b.baseScore ?? b.selectionScore, topicDiversityFactor(b.topicCluster || topicClusterOf(b.kw), batchClusters));
      return db - da || (b.kw?.score?.total || 0) - (a.kw?.score?.total || 0);
    });
    const next = remaining.shift();
    const div = topicDiversityFactor(next.topicCluster || topicClusterOf(next.kw), batchClusters);
    next.diversity = div;
    next.selectionScore = applyTopicDiversity(next.baseScore ?? next.selectionScore, div);
    ordered.push(next);
    batchClusters.push(next.topicCluster || topicClusterOf(next.kw));
  }
  // 나머지(캡 밖 후보)는 마지막 다양성 점수 기준으로 뒤에 붙임
  remaining.sort((a, b) => b.selectionScore - a.selectionScore);
  return [...ordered, ...remaining];
}

// ─── 시간대 배분 ──────────────────────────────────────────────────────

function distributeToSlots(posts) {
  const slots = {};
  for (const slot of TIME_SLOTS) {
    slots[slot] = [];
  }

  // 카테고리별 우선순위: 상업 의도 높은 비용형 → 아침/저녁 피크
  const priorityOrder = {
    '이사·청소·주거': ['0700', '0900', '1700', '2000'],
    '생활·정보': ['1200', '1700', '2000'],
    'IT·테크': ['0900', '1400', '2200'],
    '개발지식': ['1400', '2200'],
    '개발 회고': ['1400', '2200']
  };

  let slotIdx = 0;

  for (const post of posts) {
    const preferredSlots = priorityOrder[post.category] || TIME_SLOTS;
    let placed = false;

    for (const slot of preferredSlots) {
      if (slots[slot].length < (SLOT_MAX[slot] || 2)) {
        slots[slot].push(post);
        placed = true;
        break;
      }
    }

    if (!placed) {
      for (let i = 0; i < TIME_SLOTS.length; i++) {
        const slot = TIME_SLOTS[(slotIdx + i) % TIME_SLOTS.length];
        if (slots[slot].length < (SLOT_MAX[slot] || 2)) {
          slots[slot].push(post);
          placed = true;
          slotIdx = (slotIdx + 1) % TIME_SLOTS.length;
          break;
        }
      }
    }

    if (!placed) {
      console.log(`  [warn] ${post.keyword} — 모든 슬롯이 찼다`);
    }
  }

  return slots;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`날짜: ${args.date} | 일일 발행 캡: ${args.maxPosts}건`);

  const posts = await findGeneratedPosts(args.date);
  console.log(`생성된 글: ${posts.length}개`);

  if (posts.length === 0) {
    console.log('등록할 글이 없다. 먼저 generate-post.mjs로 글을 생성해라.');
    return;
  }

  const existingQueue = await loadExistingQueue(args.date);
  const existingIds = new Set(existingQueue.posts.map(p => p.id));
  let newPosts = posts.filter(p => !existingIds.has(p.id));

  // 발행 중복 게이트: 이미 블로그에 발행된 주제는 큐에 넣지 않는다.
  // (state.json 리셋/ID 체계 변경에도 실제 블로그 RSS가 최종 확인.
  //  RSS 실패 시 원장으로만 판정 — 발행은 submit-queue에서 다시 차단.)
  const gate = await buildDuplicateGate({ blogUrl: 'https://acstory.tistory.com', ledgerPath: PUBLISHED_LEDGER_PATH, log: console.error });
  const deduped = [];
  for (const post of newPosts) {
    const dup = isAlreadyPublished({ id: post.id, keyword: post.keyword || '', title: post.title || '' }, gate);
    if (dup.matched) {
      console.log(`  [DUP SKIP] ${post.keyword || post.id} — ${dup.rule} (${dup.against?.title || dup.source})`);
    } else {
      deduped.push(post);
    }
  }
  newPosts = deduped;
  // 발행 전 QA 게이트 — keywords.json contentType/ymylRisk를 전달해 유형 게이트 적용
  const keywordsData = await loadKeywords();
  const kwById = new Map((keywordsData.keywords || []).map(k => [k.id, k]));
  const qaResults = [];
  for (const post of newPosts) {
    const kw = kwById.get(post.id);
    const report = await qaMetaPost({
      ...post,
      contentType: post.contentType || kw?.contentType || '',
      ymylRisk: post.ymylRisk || kw?.ymylRisk || ''
    }, { marketResearch: true, notifyDiscord: false });
    if (!report.ok) {
      console.log(`  [QA FAIL] ${post.keyword || post.title} score=${report.score}`);
      for (const f of report.failures || []) console.log(`    - ${f.code}: ${f.message}`);
      continue;
    }
    console.log(`  [QA PASS] ${post.keyword || post.title} score=${report.score}`);
    qaResults.push({ post, report });
  }
  console.log(`새 글: ${qaResults.length}개 (기존 ${existingQueue.posts.length}개 제외, QA 통과분만)`);

  if (qaResults.length === 0) {
    console.log('새로 등록할 글이 없다.');
    return;
  }

  // 선택 단계: 게이트 + selectionScore + 믹스 + 캡
    keywordsData._queueDate = args.date;
  const { selected, rejected, rejectedMix } = await selectPosts(qaResults, keywordsData, { maxPosts: args.maxPosts });

  for (const r of rejected) {
    console.log(`  [REJECT] ${r.post.keyword || r.post.id} — ${r.reason}`);
  }
  console.log(`선정: ${selected.length}건`);
  for (const s of [...selected].sort((a, b) => b.selectionScore - a.selectionScore)) {
    console.log(`  - ${s.post.keyword} [${s.post.category}/${s.topicCluster || topicClusterOf(s.kw)}] score=${s.selectionScore} (base ${s.baseScore ?? s.selectionScore} · QA ${s.qaScore} · 갭 ${s.gapTotal} · 신선도 ${Math.round(s.freshness * 100)}% · 다양성 ${Math.round((s.diversity ?? 1) * 100)}%)`);
  }
  if (rejectedMix.length) {
    console.log(`[mix] 제약 미뤄짐: ${rejectedMix.map(d => `${d.post.keyword}(${d.reason})`).join(', ')}`);
  }

  if (selected.length === 0) {
    console.log('선정된 글이 없다.');
    return;
  }

  const slots = distributeToSlots(selected.map(s => s.post));

  console.log('\n시간대별 배분:');
  for (const slot of TIME_SLOTS) {
    const inSlot = slots[slot];
    if (inSlot.length > 0) {
      const hhmm = slot.slice(0, 2) + ':' + slot.slice(2);
      console.log(`  ${hhmm} (${inSlot.length}건):`);
      for (const p of inSlot) {
        console.log(`    - ${p.keyword} [${p.category}]`);
      }
    }
  }

  if (args.dryRun) {
    console.log('\n[dry-run] 실제 등록 없음');
    return;
  }

  // runId 상관: 기존 큐 runId > 생성 메타 runId(가장 빈도 높은 값) > 신규 mint
  let runId = existingQueue.runId || null;
  if (!runId) {
    const metaRunIds = selected.map(s => s.post?.runId || s.post?.metaRunId).filter(Boolean);
    if (metaRunIds.length) {
      const freq = new Map();
      for (const rid of metaRunIds) freq.set(rid, (freq.get(rid) || 0) + 1);
      runId = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
  }
  if (!runId) runId = `generate-${args.date}-${Date.now()}`;
  const merged = { runId, posts: [...existingQueue.posts] };

  for (const slot of TIME_SLOTS) {
    const hhmm = slot.slice(0, 2) + ':' + slot.slice(2);
    for (const post of slots[slot]) {
      const scored = selected.find(s => s.post.id === post.id);
      merged.posts.push({
        runId: post.runId || post.metaRunId || runId,
        id: post.id,
        keyword: post.keyword || '',
        publishAt: `${args.date}T${hhmm}:00+09:00`,
        blogUrl: 'https://acstory.tistory.com',
        title: post.title || post.keyword,
        bodyHtml: '',
        bodyFile: normalizeBodyFile(post.bodyFile),
        description: post.description || '',
        category: post.category,
        tags: Array.isArray(post.tags) ? post.tags.join(',') : (post.tags || ''),
        heroImage: post.thumbnail || '',
        selectionScore: scored?.selectionScore ?? null,
        qaScore: scored?.qaScore ?? null,
        sourceBundle: Array.isArray(post.sourceBundle) ? [...post.sourceBundle] : (Array.isArray(post.qa?.provenance?.sources) ? [...post.qa.provenance.sources] : []),
        ymylRisk: post.ymylRisk || post.qa?.ymylRisk || 'none',
        status: post.status || (post.qa?.ok ? 'qa_passed' : 'generated')
      });
    }
  }

  merged.posts.sort((a, b) => (a.publishAt || '').localeCompare(b.publishAt || ''));

  const queueFile = await saveQueue(args.date, merged);
  console.log(`\n큐 파일 저장: ${queueFile}`);
  console.log(`총 글 수: ${merged.posts.length}개`);

  console.log(`\n다음 단계:`);
  console.log(`  bash scripts/schedule/queue-upload.sh ${args.date}.json`);
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('auto-queue.mjs')) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
