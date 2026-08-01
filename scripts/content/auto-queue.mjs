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
import path from 'node:path';
import { qaMetaPost } from './qa-post.mjs';
import { scoreKeyword, computeSelectionScore, freshnessFactor, normalizeGapScore } from './keyword-score.mjs';
import { recentGeneratedPosts, mixBucket } from './select-keywords.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'content', 'generated');
const QUEUE_DIR = path.join(PROJECT_ROOT, 'scheduled', 'queue');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');

const TIME_SLOTS = ['0700', '0900', '1200', '1400', '1700', '2000', '2200'];
const SLOT_MAX = { '0700': 2, '0900': 3, '1200': 2, '1400': 2, '1700': 3, '2000': 2, '2200': 1 };

// 설계 §8: 애드센스 승인 전 일 3~5건 캡 (기존 SLOT_MAX 합 15 → 5)
const BOOTSTRAP_MAX_POSTS = 5;
// 설계 §3: 최근 10건 기준 믹스 50/30/20 ±10%p
const MIX_TARGET = { '비용': 50, '절차': 30, '문제해결': 20 };
const MIX_TOLERANCE_PP = 10;
const LEGACY_CAP_RATIO = 0.2; // 레거시 시리즈(정보·기타)는 전체의 20% 상한

function parseArgs(argv) {
  const args = { date: '', dryRun: false, maxPosts: BOOTSTRAP_MAX_POSTS };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i + 1]) { args.date = argv[++i]; }
    else if (argv[i] === '--dry-run') { args.dryRun = true; }
    else if (argv[i] === '--max-posts' && argv[i + 1]) { args.maxPosts = Number(argv[++i]) || BOOTSTRAP_MAX_POSTS; }
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
      // QA 통과 글만 큐 등록 대상
      if (meta.status === 'qa_failed') continue;
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
    if (selected.length >= cap) { pushDeferred(c, '부트스트랩 일 캡 초과'); continue; }
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
    if (d.reason.startsWith('부트스트랩')) break; // 캡 초과분은 절대 채우지 않는다
    selected.push(d);
  }
  if (selected.length > filled) {
    console.log(`  [warn] 믹스 제약 완화로 ${selected.length - filled}건 추가 채움`);
  }
  return { selected, rejectedMix: deferred };
}

async function selectPosts(qaResults, keywordsData, { maxPosts = BOOTSTRAP_MAX_POSTS } = {}) {
  const kwById = new Map(keywordsData.keywords.map(k => [k.id, k]));
  const focus = keywordsData.focusCategories;
  const allowLegacy = keywordsData.allowLegacySeries;
  const rejected = [];
  const candidates = [];

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
    candidates.push({
      post,
      kw,
      qaScore: report.score,
      gapTotal: gapScore,
      freshness,
      selectionScore: computeSelectionScore({
        commercialIntentScore: r.score.intent,
        qaScore: report.score,
        serpGapScore: gapScore,
        freshness
      })
    });
  }

  candidates.sort((a, b) => b.selectionScore - a.selectionScore || (b.kw.score?.total || 0) - (a.kw.score?.total || 0));

  const recent = (await recentGeneratedPosts(10)).filter(p => kwById.get(p.id)?.enabled);
  const { selected, rejectedMix } = enforceMix(candidates, recent, kwById, maxPosts);
  return { selected, rejected, rejectedMix };
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
  console.log(`날짜: ${args.date} | 부트스트랩 일 캡: ${args.maxPosts}건`);

  const posts = await findGeneratedPosts(args.date);
  console.log(`생성된 글: ${posts.length}개`);

  if (posts.length === 0) {
    console.log('등록할 글이 없다. 먼저 generate-post.mjs로 글을 생성해라.');
    return;
  }

  const existingQueue = await loadExistingQueue(args.date);
  const existingIds = new Set(existingQueue.posts.map(p => p.id));
  let newPosts = posts.filter(p => !existingIds.has(p.id));

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
  const { selected, rejected, rejectedMix } = await selectPosts(qaResults, keywordsData, { maxPosts: args.maxPosts });

  for (const r of rejected) {
    console.log(`  [REJECT] ${r.post.keyword || r.post.id} — ${r.reason}`);
  }
  console.log(`선정: ${selected.length}건`);
  for (const s of [...selected].sort((a, b) => b.selectionScore - a.selectionScore)) {
    console.log(`  - ${s.post.keyword} [${s.post.category}] score=${s.selectionScore} (QA ${s.qaScore} · 갭 ${s.gapTotal} · 신선도 ${Math.round(s.freshness * 100)}%)`);
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

  // 큐에 등록
  const merged = { posts: [...existingQueue.posts] };

  for (const slot of TIME_SLOTS) {
    const hhmm = slot.slice(0, 2) + ':' + slot.slice(2);
    for (const post of slots[slot]) {
      const scored = selected.find(s => s.post.id === post.id);
      merged.posts.push({
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
        qaScore: scored?.qaScore ?? null
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
