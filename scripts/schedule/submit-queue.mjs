#!/usr/bin/env node
/**
 * submit-queue.mjs — 큐에 있는 글을 workbench API로 Job 생성
 *
 * 용도:
 *   1. 로컬에서 큐 JSON을 서버로 업로드 후 실행
 *   2. 서버 cron에서 매일 실행하여 오늘 발행할 글을 Job으로 생성
 *
 * 사용법:
 *   node scripts/schedule/submit-queue.mjs --queue-dir /srv/publish-workbench/scheduled/queue
 *   node scripts/schedule/submit-queue.mjs --queue-dir ./scheduled/queue --dry-run
 *   node scripts/schedule/submit-queue.mjs --queue-dir ./scheduled/queue --date 2026-07-28
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { qaHtmlPost } from '../content/qa-post.mjs';
import { recordPublishFeedback } from '../content/market-research.mjs';
import { buildDuplicateGate, isAlreadyPublished } from '../lib/published-posts.mjs';
import { evaluateYmylGate, detectYmylRisk } from '../content/keyword-score.mjs';
import { hasSourceUrls, hasOfficialSourceUrls } from '../content/provenance-gate.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');
const PUBLISHED_LEDGER_PATH = process.env.PUBLISHED_LEDGER_PATH
  || path.join(PROJECT_ROOT, 'content', 'published.json');
const DEFAULT_BLOG_URL = 'https://acstory.tistory.com';

const WORKBENCH_HOST = process.env.WORKBENCH_HOST || '127.0.0.1';
const WORKBENCH_PORT = Number(process.env.WORKBENCH_PORT || 4310);
function idempotencyKeyFor(post) {
  const source = [
    post.blogUrl || DEFAULT_BLOG_URL,
    post.id || '',
    post.keyword || '',
    post.title || '',
    post.publishAt || ''
  ].join('\x1f');
  return `queue-${crypto.createHash('sha256').update(source).digest('hex').slice(0, 32)}`;
}
const WORKBENCH_BASE = process.env.WORKBENCH_BASE_URL || `http://${WORKBENCH_HOST}:${WORKBENCH_PORT}`;


// 발행 직전 QA — qa-post 로직 공유 (설계 §9 Phase 2) + 키워드 게이트 중복 방어 (I1).
// marketResearch는 서버에서 라이브 크롤을 피하려고 끈다.
export async function qaQueuePost(post) {
  let contentType = post.contentType || '';
  let ymylRisk = post.ymylRisk || '';
  const failures = [];
  const warnings = [];

  if (post.id || post.keyword) {
    try {
      const raw = await fs.readFile(KEYWORDS_PATH, 'utf8');
      const data = JSON.parse(raw);
      const list = data.keywords || [];
      // 큐 id는 `life-02` 또는 `life-02-2026-07-30` 형태일 수 있다.
      const kw = list.find(k => k.id === post.id)
        || list.find(k => post.id && post.id.startsWith(`${k.id}-`))
        || list.find(k => post.keyword && k.keyword === post.keyword);
      if (!kw && post.id) {
        failures.push(`keyword-missing:${post.id}`);
      } else if (kw) {
        contentType = contentType || kw.contentType || '';
        let derivedRisk = '';
        try { derivedRisk = detectYmylRisk(kw.keyword || post.keyword || '', kw.category || post.category || '').risk || ''; } catch {}
        const effectiveRisk = String(derivedRisk || kw.ymylRisk || '').toLowerCase().trim();
        // stored 'none' must not mask derived high — effectiveRisk authoritative for YMYL
        ymylRisk = effectiveRisk || ymylRisk || '';
        if (kw.enabled === false) failures.push(`keyword-disabled:${kw.id}`);
        if (effectiveRisk === 'high') {
          // 선택 단계와 동일한 안전 유형 판정을 쓴다 — 공식 절차·서류·문의처·수수료·경험기록형
          // YMYL 키워드는 발행 직전에도 허용하고, 비교·추천 등 위험형만 차단한다.
          const gate = evaluateYmylGate({
            keyword: kw.keyword || post.keyword || post.id || '',
            category: kw.category || post.category || '',
            contentType: contentType || kw.contentType || '',
            title: post.title || ''
          });
          if (!gate.allowed) failures.push(`keyword-ymyl:${kw.id} — ${gate.reason}`);
        }
      }
    } catch {
      warnings.push('keywords-unreadable');
    }
  }

  // Phase 2: template fallback and YMYL official source gate
  if (post.status === 'draft_only' || post.usingTemplate === true) {
    failures.push('draft-only-template-fallback');
  }
  const postYmyl = String(ymylRisk || '').toLowerCase();
  if ((postYmyl === 'high' || postYmyl === 'medium') && !hasOfficialSourceUrls(post.sourceBundle)) {
    failures.push('provenance-ymyl-source-missing: official domain required (gov.kr/go.kr/korea.kr etc.) — blog URL alone does not satisfy YMYL');
  }

  const html = post.bodyHtml || post.body || '';
  const report = qaHtmlPost(html, {
    title: post.title || '',
    keyword: post.keyword || post.id || '',
    category: post.category || '',
    contentType,
    ymylRisk
  });
  for (const f of report.failures || []) failures.push(f.code || String(f));
  for (const w of report.warnings || []) warnings.push(w.code || String(w));

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    plainChars: report.metrics?.plainChars || 0,
    score: report.score
  };
}


function parseArgs(argv) {
  const args = { queueDir: '', dryRun: false, date: '', verbose: false, due: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--queue-dir' && next) { args.queueDir = next; i++; }
    else if (arg === '--date' && next) { args.date = next; i++; }
    else if (arg === '--dry-run') { args.dryRun = true; }
    else if (arg === '--verbose') { args.verbose = true; }
    else if (arg === '--due') { args.due = true; }
    else if (arg === '--help') {
      console.log(`사용법: node submit-queue.mjs --queue-dir <DIR> [옵션]

옵션:
  --queue-dir DIR   큐 JSON 파일이 있는 디렉토리
  --date YYYY-MM-DD 특정 날짜의 글만 처리 (기본: 오늘)
  --dry-run         실제로 Job 생성하지 않고 출력만
  --verbose         상세 로그
  --due             publishAt 이 현재 이전인 due 글만 제출(15분 간격 타이머용)`);
      process.exit(0);
    }
  }
  return args;
}

function todayDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function readQueueFiles(queueDir) {
  const entries = await fs.readdir(queueDir).catch(() => []);
  const files = entries.filter(e => e.endsWith('.json')).sort();
  const posts = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(queueDir, file), 'utf8');
      const data = JSON.parse(raw);
      if (data.posts && Array.isArray(data.posts)) {
        for (const post of data.posts) {
          posts.push({ ...post, _sourceFile: file });
        }
      }
    } catch (error) {
      console.error(` 큐 파일 읽기 실패: ${file} — ${error.message}`);
    }
  }
  return posts;
}

function matchesDateFilter(post, targetDate) {
  if (!targetDate) return true;
  if (!post.publishAt) return false;
  return post.publishAt.startsWith(targetDate);
}

export function isPostDue(post, nowMs = Date.now()) {
  if (!post.publishAt) return false;
  const at = Date.parse(post.publishAt);
  if (Number.isNaN(at)) return false;
  return at <= nowMs + 5 * 60 * 1000;
}

export async function movePost(queueDir, submittedDir, filename, post) {
  try {
    const srcPath = path.join(queueDir, filename);
    const raw = await fs.readFile(srcPath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.posts)) return false;
    const posts = data.posts;
    let idx = -1;
    if (post && typeof post.id === 'string' && post.id) {
      idx = posts.findIndex((p) => p && p.id === post.id);
    }
    if (idx === -1 && post) {
      const needle = JSON.stringify(post);
      idx = posts.findIndex((p) => JSON.stringify(p) === needle);
    }
    if (idx === -1) return false;
    const [moved] = posts.splice(idx, 1);
    const remainingData = { ...data, posts };
    await fs.writeFile(srcPath, JSON.stringify(remainingData, null, 2) + '\n', 'utf8');
    await fs.mkdir(submittedDir, { recursive: true });
    const base = (moved && moved.id) || filename.replace(/\.json$/, '');
    const dstName = `${base}-${Date.now()}.json`;
    const dstPath = path.join(submittedDir, dstName);
    await fs.writeFile(dstPath, JSON.stringify({ posts: [moved] }, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}
async function submitJob(post, { dryRun, verbose }) {
  // bodyFile 이 있으면 읽어서 bodyHtml 로 채운다
  if (!post.bodyHtml && !post.body && post.bodyFile) {
    try {
      const bodyPath = path.isAbsolute(post.bodyFile)
        ? post.bodyFile
        : path.join(PROJECT_ROOT, post.bodyFile);
      post.bodyHtml = await fs.readFile(bodyPath, 'utf8');
    } catch (error) {
      return { ok: false, error: `bodyFile 읽기 실패: ${post.bodyFile}` };
    }
  }
  const qa = await qaQueuePost(post);
  if (!qa.ok) {
    return { ok: false, error: `QA 실패: ${qa.failures.join(', ')}`, qa };
  }

  const payload = {
    type: 'publish_post',
    runId: post.runId || `queue-${post.publishAt?.slice(0, 10) || 'unknown'}`,
    idempotencyKey: idempotencyKeyFor(post),
    notBefore: post.publishAt || null,
    maxAttempts: 3,
    blogUrl: post.blogUrl || 'https://acstory.tistory.com',
    title: post.title,
    body: post.bodyHtml || post.body || '',
    description: post.description || '',
    tags: Array.isArray(post.tags) ? post.tags.join(',') : (post.tags || ''),
    category: post.category || '',
    heroImagePath: post.heroImage || '',
    // provenance bundle (official URLs) for audit — preserve any shape recognized by extractSourceUrls (array, {url}, {urls/sources/links}); otherwise ledger ref
    sourceBundle: (() => { const sb = post.sourceBundle; if (Array.isArray(sb) && sb.length) return sb; if (sb && typeof sb === 'object') { if (sb.url || sb.urls || sb.sources || sb.links) return sb; const keys = Object.keys(sb); if (keys.length && keys.some(k => ['id','keyword','urls'].includes(k)) === false) { /* generic object with url-like keys */ if (typeof sb.url === 'string' || Array.isArray(sb.urls) || Array.isArray(sb.sources) || Array.isArray(sb.links)) return sb; } } if (sb && typeof sb === 'object' && (sb.url || sb.urls || sb.sources || sb.links)) return sb; if (sb && typeof sb === 'object' && Object.keys(sb).length) return sb; return { id: post.id || '', keyword: post.keyword || '', urls: Array.isArray(sb) ? sb : [] }; })(),
  };

  if (verbose || dryRun) {
    console.log(`  [JOB] ${post.title}`);
    console.log(`    블로그: ${payload.blogUrl}`);
    console.log(`    카테고리: ${payload.category || '(없음)'}`);
    console.log(`    태그: ${payload.tags || '(없음)'}`);
    console.log(`    본문 금지: ${(payload.body || '').length}자`);
  }

  if (dryRun) {
    return { ok: true, dryRun: true, postId: post.id };
  }

  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const req = http.request(`${WORKBENCH_BASE}/api/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, jobId: result.job?.jobId, statusCode: res.statusCode });
          } else {
            resolve({ ok: false, error: result.error || `HTTP ${res.statusCode}`, statusCode: res.statusCode });
          }
        } catch {
          resolve({ ok: false, error: `JSON 파싱 실패: ${data.slice(0, 200)}` });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function moveToSubmitted(queueDir, submittedDir, sourceFile, postId) {
  try {
    const srcPath = path.join(queueDir, sourceFile);
    const dstName = `${postId || sourceFile.replace('.json', '')}-${Date.now()}.json`;
    const dstPath = path.join(submittedDir, dstName);
    await fs.rename(srcPath, dstPath);
    return true;
  } catch {
    return false;
  }
}

async function moveToFailed(queueDir, failedDir, sourceFile, postId) {
  try {
    const srcPath = path.join(queueDir, sourceFile);
    const dstName = `failed-${postId || sourceFile.replace('.json', '')}-${Date.now()}.json`;
    const dstPath = path.join(failedDir, dstName);
    await fs.rename(srcPath, dstPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.queueDir) {
    console.error('--queue-dir 이 필요하다.');
    process.exit(1);
  }

  const targetDate = args.date || todayDate();
  const submittedDir = path.resolve(args.queueDir, '..', 'submitted');
  const failedDir = path.resolve(args.queueDir, '..', 'failed');

  console.log(`큐 처리 시작 — 대상 날짜: ${targetDate}`);
  console.log(`큐 디렉토리: ${args.queueDir}`);
  console.log(`workbench: ${WORKBENCH_BASE}`);

  const allPosts = await readQueueFiles(args.queueDir);
  const todayPosts = allPosts.filter(p => matchesDateFilter(p, targetDate));

  console.log(`큐 전체 ${allPosts.length}건, 오늘(${targetDate}) 대상 ${todayPosts.length}건`);

  if (todayPosts.length === 0) {
    console.log('처리할 글이 없다.');
    return;
  }

  // 발행 중복 게이트: 발행 원장 + 블로그 RSS 기준으로 이미 발행된 글은 차단
  // (원장이 초기화되어도 실제 블로그 RSS가 최종 확인 — 08-04 정수기/ChatGPT/Docker
  //  재발행 같은 사고의 최후 방어선. RSS 실패 시 원장으로만 판정.)
  const blogUrl = todayPosts[0]?.blogUrl || DEFAULT_BLOG_URL;
  const gate = await buildDuplicateGate({ blogUrl, ledgerPath: PUBLISHED_LEDGER_PATH, log: console.error });
  const publishable = [];
  const blocked = [];
  for (const post of todayPosts) {
    const dup = isAlreadyPublished(post, gate);
    if (dup.matched) {
      blocked.push(post);
      console.error(`  ✗ 중복 발행 차단: ${post.title || post.id} — ${dup.rule} (${dup.against?.title || dup.source})`);
    } else {
      publishable.push(post);
    }
  }
  if (blocked.length > 0) {
    console.error(`중복 차단 ${blocked.length}건 (${blocked.map(p => p.id).join(', ')}) — 발행 생략`);
  }
  if (publishable.length === 0) {
    console.log('발행할 새 글이 없다.');
    return;
  }

  const results = [];
  for (const post of publishable) {
    console.log(`\n→ 발행: ${post.title || post.id || '(제목 없음)'}`);
    try {
      const result = await submitJob(post, { dryRun: args.dryRun, verbose: args.verbose });
      results.push({ post, result });

      if (result.ok) {
        console.log(`  ✓ ${result.dryRun ? '(dry-run)' : `Job 생성됨: ${result.jobId}`}`);
        if (!args.dryRun) {
          await moveToSubmitted(args.queueDir, submittedDir, post._sourceFile, post.id);
        }
      } else {
        console.error(`  ✗ 실패: ${result.error}`);
        if (!args.dryRun) {
          await moveToFailed(args.queueDir, failedDir, post._sourceFile, post.id);
        }
      }
      // 피드백 루프 (설계 §9 Phase 3): 발행 시도 결과를 학습 메모리에 기록
      if (!args.dryRun) {
        await recordPublishFeedback({
          keyword: post.keyword || post.id || '',
          title: post.title || '',
          status: result.ok ? 'succeeded' : 'failed',
          category: post.category || ''
        }).catch(error => {
          console.error(`  ⚠ 피드백 기록 실패: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      // 발행 원장(ledger)은 worker가 발행 성공 시점에 기록한다 (handlers.mjs).
      // 제출(Job 생성) 시점에 기록하면 실제 발행이 실패해도 원장에 남아
      // 재발행 시도가 중복 게이트에 막히는 문제가 있다. URL 없이 기록하지 않는다.
    } catch (error) {
      console.error(`  ✗ 에러: ${error.message}`);
      results.push({ post, result: { ok: false, error: error.message } });
      if (!args.dryRun) {
        await moveToFailed(args.queueDir, failedDir, post._sourceFile, post.id);
      }
    }
  }

  const succeeded = results.filter(r => r.result.ok).length;
  const failed = results.filter(r => !r.result.ok).length;
  console.log(`\n완료 — 성공: ${succeeded}, 실패: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('submit-queue.mjs')) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
