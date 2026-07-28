#!/usr/bin/env node
/**
 * queue-add.mjs — 큐에 발행할 글 추가
 *
 * 사용법:
 *   node scripts/schedule/queue-add.mjs \
 *     --date 2026-07-28 --time 09:00 \
 *     --title "글 제목" \
 *     --body-file content/xxx/html/yyy.html \
 *     --category "IT·테크" \
 *     --tags "PonsLink,WebRTC" \
 *     --blog-url https://acstory.tistory.com
 *
 *   node scripts/schedule/queue-add.mjs \
 *     --date 2026-07-28 --time 09:00 \
 *     --title "글 제목" \
 *     --body '<h2>본문</h2>' \
 *     --queue-dir /srv/publish-workbench/scheduled/queue
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function parseArgs(argv) {
  const args = {
    date: '',
    time: '09:00',
    title: '',
    body: '',
    bodyFile: '',
    description: '',
    category: '',
    tags: '',
    blogUrl: 'https://acstory.tistory.com',
    heroImage: '',
    queueDir: '',
    id: ''
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--date' && next) { args.date = next; i++; }
    else if (arg === '--time' && next) { args.time = next; i++; }
    else if (arg === '--title' && next) { args.title = next; i++; }
    else if (arg === '--body' && next) { args.body = next; i++; }
    else if (arg === '--body-file' && next) { args.bodyFile = next; i++; }
    else if (arg === '--description' && next) { args.description = next; i++; }
    else if (arg === '--category' && next) { args.category = next; i++; }
    else if (arg === '--tags' && next) { args.tags = next; i++; }
    else if (arg === '--blog-url' && next) { args.blogUrl = next; i++; }
    else if (arg === '--hero-image' && next) { args.heroImage = next; i++; }
    else if (arg === '--queue-dir' && next) { args.queueDir = next; i++; }
    else if (arg === '--id' && next) { args.id = next; i++; }
    else if (arg === '--help') {
      console.log(`사용법: node queue-add.mjs --date YYYY-MM-DD --title "제목" [옵션]

옵션:
  --date YYYY-MM-DD   발행 날짜 (필수)
  --time HH:MM        발행 시각 (기본: 09:00)
  --title TEXT         글 제목 (필수)
  --body TEXT          HTML 본문 직접 입력
  --body-file PATH     HTML 본문 파일 경로
  --description TEXT   글 설명
  --category TEXT      카테고리
  --tags TEXT          쉼표 구분 태그
  --blog-url URL       블로그 URL (기본: acstory.tistory.com)
  --hero-image PATH    대표 이미지 경로
  --queue-dir DIR      큐 디렉토리 (기본: ./scheduled/queue)
  --id TEXT            글 고유 ID (기본: 자동 생성)`);
      process.exit(0);
    }
  }
  return args;
}

async function readBodyFile(filePath) {
  const resolved = path.resolve(filePath);
  return fs.readFile(resolved, 'utf8');
}

function generateId(date, title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const rand = crypto.randomUUID().slice(0, 6);
  return `${date}-${slug}-${rand}`;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.date) {
    console.error('--date 이 필요하다. (예: --date 2026-07-28)');
    process.exit(1);
  }
  if (!args.title) {
    console.error('--title 이 필요하다.');
    process.exit(1);
  }

  let bodyHtml = args.body;
  if (args.bodyFile) {
    bodyHtml = await readBodyFile(args.bodyFile);
  }
  if (!bodyHtml) {
    console.error('--body 또는 --body-file 이 필요하다.');
    process.exit(1);
  }

  const postId = args.id || generateId(args.date, args.title);
  const [hour, minute] = args.time.split(':').map(Number);

  const post = {
    id: postId,
    publishAt: `${args.date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`,
    blogUrl: args.blogUrl,
    title: args.title,
    bodyHtml,
    description: args.description,
    tags: args.tags,
    category: args.category,
    heroImage: args.heroImage
  };

  // 큐 파일은 날짜별로 하나씩 (같은 날 발행 글은 하나의 파일에 묶음)
  const queueDir = args.queueDir || path.join(process.cwd(), 'scheduled', 'queue');
  const queueFile = path.join(queueDir, `${args.date}.json`);

  let existing = { posts: [] };
  try {
    const raw = await fs.readFile(queueFile, 'utf8');
    existing = JSON.parse(raw);
    if (!existing.posts) existing.posts = [];
  } catch {
    // 새 파일
  }

  // 같은 ID가 있으면 교체
  const idx = existing.posts.findIndex(p => p.id === postId);
  if (idx >= 0) {
    existing.posts[idx] = post;
    console.log(`큐 글 업데이트: ${postId}`);
  } else {
    existing.posts.push(post);
    console.log(`큐 글 추가: ${postId}`);
  }

  existing.posts.sort((a, b) => (a.publishAt || '').localeCompare(b.publishAt || ''));

  await fs.mkdir(queueDir, { recursive: true });
  await fs.writeFile(queueFile, JSON.stringify(existing, null, 2) + '\n', 'utf8');

  console.log(`  파일: ${queueFile}`);
  console.log(`  제목: ${args.title}`);
  console.log(`  발행: ${args.date} ${args.time}`);
  console.log(`  카테고리: ${args.category || '(없음)'}`);
  console.log(`  태그: ${args.tags || '(없음)'}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
