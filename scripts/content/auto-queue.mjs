#!/usr/bin/env node
/**
 * auto-queue.mjs — 생성된 글을 읽어서 큐에 자동 등록
 *
 * content/generated/YYYY-MM-DD/ 디렉토리의 .meta.json 파일을 읽고,
 * 시간대별로 분배하여 scheduled/queue/에 등록한다.
 *
 * 사용법:
 *   node scripts/content/auto-queue.mjs
 *   node scripts/content/auto-queue.mjs --date 2026-07-28
 *   node scripts/content/auto-queue.mjs --dry-run
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { qaMetaPost } from './qa-post.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'content', 'generated');
const QUEUE_DIR = path.join(PROJECT_ROOT, 'scheduled', 'queue');

const TIME_SLOTS = ['0700', '0900', '1200', '1400', '1700', '2000', '2200'];
const SLOT_MAX = { '0700': 2, '0900': 3, '1200': 2, '1400': 2, '1700': 3, '2000': 2, '2200': 1 };

function parseArgs(argv) {
  const args = { date: '', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i+1]) { args.date = argv[++i]; }
    else if (argv[i] === '--dry-run') { args.dryRun = true; }
    else if (argv[i] === '--help') {
      console.log(`사용법: node auto-queue.mjs [--date YYYY-MM-DD] [--dry-run]`);
      process.exit(0);
    }
  }
  if (!args.date) {
    const now = new Date();
    args.date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  return args;
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

function distributeToSlots(posts) {
  const slots = {};
  for (const slot of TIME_SLOTS) {
    slots[slot] = [];
  }

  // 카테고리별 우선순위: S/A 티어 → 아침/저녁 피크
  const priorityOrder = {
    '투자·재테크': ['0700', '0900', '1700', '2000'],
    '생활·정보': ['1200', '1700', '2000'],
    'IT·테크': ['0900', '1400', '2200'],
    '개발지식': ['1400', '2200'],
    '개발 회고': ['1400', '2200']
  };

  let slotIdx = 0;

  for (const post of posts) {
    const preferredSlots = priorityOrder[post.category] || TIME_SLOTS;
    let placed = false;

    // 선호 시간대에 빈 자리가 있으면 배치
    for (const slot of preferredSlots) {
      if (slots[slot].length < (SLOT_MAX[slot] || 2)) {
        slots[slot].push(post);
        placed = true;
        break;
      }
    }

    // 선호 시간대가 꽉 찼으면 순서대로 배치
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
  console.log(`날짜: ${args.date}`);

  const posts = await findGeneratedPosts(args.date);
  console.log(`생성된 글: ${posts.length}개`);

  if (posts.length === 0) {
    console.log('등록할 글이 없다. 먼저 generate-post.mjs로 글을 생성해라.');
    return;
  }

  const existingQueue = await loadExistingQueue(args.date);
  const existingIds = new Set(existingQueue.posts.map(p => p.id));
  let newPosts = posts.filter(p => !existingIds.has(p.id));

  // 발행 전 QA 게이트
  const qaPassed = [];
  for (const post of newPosts) {
    const report = await qaMetaPost(post, { marketResearch: true, notifyDiscord: false });
    if (!report.ok) {
      console.log(`  [QA FAIL] ${post.keyword || post.title} score=${report.score}`);
      for (const f of report.failures || []) console.log(`    - ${f.code}: ${f.message}`);
      continue;
    }
    console.log(`  [QA PASS] ${post.keyword || post.title} score=${report.score}`);
    qaPassed.push(post);
  }
  newPosts = qaPassed;
  console.log(`새 글: ${newPosts.length}개 (기존 ${existingQueue.posts.length}개 제외, QA 통과분만)`);

  if (newPosts.length === 0) {
    console.log('새로 등록할 글이 없다.');
    return;
  }

  const slots = distributeToSlots(newPosts);

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
      merged.posts.push({
        id: post.id,
        publishAt: `${args.date}T${hhmm}:00+09:00`,
        blogUrl: 'https://acstory.tistory.com',
        title: post.title || post.keyword,
        bodyHtml: '',
        bodyFile: post.bodyFile,
        description: post.description || '',
        category: post.category,
        tags: Array.isArray(post.tags) ? post.tags.join(',') : (post.tags || ''),
        heroImage: post.thumbnail || ''
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

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
