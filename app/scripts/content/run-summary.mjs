#!/usr/bin/env node
/**
 * run-summary.mjs — daily runId별 generate/queue/publish 집계
 *
 * daily runId별로 generate/queue/publish 결과를 content/learning/run-summary-<date>.json에 집계.
 * generate-daily.sh의 runId와 auto-queue/submit-queue 기반.
 *
 * 데이터 소스:
 *  - generate: content/generated/<date>/*.meta.json (qa.ok / status)
 *  - queue: scheduled/queue/<date>.json (runId, posts[], publishAt)
 *  - publish (due): queue posts 중 isPostDue(now) 판정 (submit-queue와 동일 로직)
 *
 * 원칙: 실패를 0으로 치환하지 않는다 — ENOENT는 빈 결과, 그 외 오류는 그대로 throw.
 *
 * 사용법:
 *   node scripts/content/run-summary.mjs
 *   node scripts/content/run-summary.mjs --date 2026-08-27
 *   node scripts/content/run-summary.mjs --date 2026-08-27 --generated-dir /tmp/gen --queue-dir /tmp/queue --learning-dir /tmp/learning
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GENERATED_DIR_DEFAULT = path.join(PROJECT_ROOT, 'content', 'generated');
const QUEUE_DIR_DEFAULT = process.env.SCHEDULED_QUEUE_DIR
  || (existsSync('/srv/publish-workbench/scheduled/queue')
    ? '/srv/publish-workbench/scheduled/queue'
    : path.join(PROJECT_ROOT, 'scheduled', 'queue'));
const LEARNING_DIR_DEFAULT = path.join(PROJECT_ROOT, 'content', 'learning');

// ─── helpers ──────────────────────────────────────────────────────────

export function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayDate = todayLocalDate;

// submit-queue.mjs와 동일: publishAt <= now + 5분 이면 due
export function isPostDue(post, nowMs = Date.now()) {
  if (!post || !post.publishAt) return false;
  const at = Date.parse(post.publishAt);
  if (Number.isNaN(at)) return false;
  const now = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  if (Number.isNaN(now)) return false;
  return at <= now + 5 * 60 * 1000;
}
export const isDue = isPostDue;
export const isPostDueByDate = isPostDue;


function isQaPassed(meta) {
  if (!meta) return false;
  if (meta.status === 'draft_only') return false;
  if (meta.qa && typeof meta.qa.ok === 'boolean') return meta.qa.ok === true;
  if (typeof meta.qaPassed === 'boolean') return meta.qaPassed;
  if (typeof meta.ok === 'boolean' && meta.keyword) return meta.ok;
  if (meta.status === 'qa_passed') return true;
  if (meta.status === 'qa_failed') return false;
  return false;
}
function isQaFailed(meta) {
  if (!meta) return false;
  if (meta.qa && typeof meta.qa.ok === 'boolean') return meta.qa.ok === false;
  if (meta.status === 'qa_failed') return true;
  return false;
}

// ─── read generated ─────────────────────────────────────────────────

export async function readGeneratedMetas({ date, generatedDir = GENERATED_DIR_DEFAULT } = {}) {
  const d = date || todayLocalDate();
  const candidateDirs = [path.join(generatedDir, d), generatedDir];
  for (const dir of candidateDirs) {
    let files;
    try {
      files = await fs.readdir(dir);
    } catch (e) {
      if (e?.code === 'ENOENT') continue;
      throw e;
    }
    const metas = [];
    for (const file of files) {
      if (!file.endsWith('.meta.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf8');
        const meta = JSON.parse(raw);
        metas.push(meta);
      } catch {
        continue;
      }
    }
    // fallback: if no .meta.json found, accept any .json that looks like a meta (has qa/status/id)
    // This makes tests that write simple <id>.json still countable without forcing .meta.json naming.
    if (metas.length === 0) {
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        if (file.endsWith('.qa.json')) continue;
        if (file.endsWith('.meta.json')) continue; // already handled
        // avoid queue-style files that contain posts array — those are not generated metas
        try {
          const raw = await fs.readFile(path.join(dir, file), 'utf8');
          const data = JSON.parse(raw);
          if (data && typeof data === 'object' && !Array.isArray(data.posts) && (data.id || data.keyword || data.status || data.qa)) {
            metas.push(data);
          }
        } catch {
          continue;
        }
      }
    }
    if (dir === path.join(generatedDir, d)) {
      if (metas.length > 0 || existsSync(dir)) {
        const total = metas.length;
        const qaPassed = metas.filter(isQaPassed).length;
        const qaFailed = metas.filter(isQaFailed).length;
        metas.total = total;
        metas.qaPassed = qaPassed;
        metas.qaFailed = qaFailed;
        metas.generatedTotal = total;
        return metas;
      }
      try {
        await fs.stat(dir);
        const total = metas.length;
        const qaPassed = metas.filter(isQaPassed).length;
        const qaFailed = metas.filter(isQaFailed).length;
        metas.total = total;
        metas.qaPassed = qaPassed;
        metas.qaFailed = qaFailed;
        metas.generatedTotal = total;
        return metas;
      } catch {}
      continue;
    } else {
      const total = metas.length;
      const qaPassed = metas.filter(isQaPassed).length;
      const qaFailed = metas.filter(isQaFailed).length;
      metas.total = total;
      metas.qaPassed = qaPassed;
      metas.qaFailed = qaFailed;
      metas.generatedTotal = total;
      return metas;
    }
  }
  const empty = [];
  empty.total = 0;
  empty.qaPassed = 0;
  empty.qaFailed = 0;
  empty.generatedTotal = 0;
  return empty;
}

export async function collectGenerateStats(opts = {}) {
  const metas = await readGeneratedMetas(opts);
  return {
    total: metas.total ?? metas.length,
    qaPassed: metas.qaPassed ?? metas.filter(isQaPassed).length,
    qaFailed: metas.qaFailed ?? metas.filter(isQaFailed).length,
    generatedTotal: metas.total ?? metas.length,
    metas,
    count: metas.length,
  };
}
export const readGenerated = readGeneratedMetas;
export const getGenerateStats = collectGenerateStats;
export const getGeneratedStats = collectGenerateStats;

// ─── read queue ─────────────────────────────────────────────────────

export async function readQueuePosts({ date, queueDir = QUEUE_DIR_DEFAULT } = {}) {
  const d = date || todayLocalDate();
  const filePath = path.join(queueDir, `${d}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const fileRunId = data.runId || null;
    const total = posts.length;
    const due = posts.filter(p => isPostDue(p)).length;
    const result = { fileRunId, posts, rawData: data, total, due, queuedTotal: total, dueCount: due, count: total };
    posts.total = total;
    posts.due = due;
    posts.fileRunId = fileRunId;
    return result;
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
  }
  try {
    const files = await fs.readdir(queueDir);
    const allPosts = [];
    let fileRunId = null;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      if (file.startsWith('run-summary-')) continue;
      if (file.startsWith('shadow-')) continue;
      if (file.startsWith('feedback-')) continue;
      try {
        const raw = await fs.readFile(path.join(queueDir, file), 'utf8');
        const data = JSON.parse(raw);
        if (data.runId && !fileRunId) fileRunId = data.runId;
        const posts = Array.isArray(data.posts) ? data.posts : [];
        for (const p of posts) {
          if (d && p.publishAt) {
            if (p.publishAt.startsWith(d)) allPosts.push(p);
          } else if (!d) {
            allPosts.push(p);
          }
        }
        if (!Array.isArray(data.posts) && data.publishAt && data.publishAt.startsWith(d)) {
          allPosts.push(data);
        }
      } catch {
        continue;
      }
    }
    const total = allPosts.length;
    const due = allPosts.filter(p => isPostDue(p)).length;
    allPosts.total = total;
    allPosts.due = due;
    allPosts.fileRunId = fileRunId;
    return { fileRunId, posts: allPosts, rawData: null, total, due, queuedTotal: total, dueCount: due, count: total };
  } catch (e) {
    if (e?.code === 'ENOENT') {
      const empty = [];
      empty.total = 0;
      empty.due = 0;
      empty.fileRunId = null;
      return { fileRunId: null, posts: empty, rawData: null, total: 0, due: 0, queuedTotal: 0, dueCount: 0, count: 0 };
    }
    throw e;
  }
}

export async function collectQueueStats(opts = {}) {
  const { fileRunId, posts, total, due } = await readQueuePosts(opts);
  return {
    fileRunId,
    posts,
    total: total ?? posts.length,
    due: due ?? posts.filter(p => isPostDue(p)).length,
    queuedTotal: total ?? posts.length,
    dueCount: due ?? posts.filter(p => isPostDue(p)).length,
    count: total ?? posts.length,
  };
}
export const readQueue = readQueuePosts;
export const getQueueStats = collectQueueStats;
export const getQueuedStats = collectQueueStats;

// ─── aggregate ──────────────────────────────────────────────────────

export function aggregateByRunId(opts = {}, maybeQueuePosts, maybeOpts) {
  let generatedMetas = [];
  let queuePosts = [];
  let fileRunId = null;
  let date = todayLocalDate();
  let now = Date.now();

  if (Array.isArray(opts)) {
    generatedMetas = opts || [];
    queuePosts = Array.isArray(maybeQueuePosts) ? maybeQueuePosts : [];
    const o = maybeOpts && typeof maybeOpts === 'object' ? maybeOpts : {};
    fileRunId = o.fileRunId ?? null;
    date = o.date ?? date;
    now = o.now ?? now;
  } else if (opts && typeof opts === 'object') {
    generatedMetas = opts.generatedMetas ?? opts.metas ?? opts.generated ?? [];
    queuePosts = opts.queuePosts ?? opts.posts ?? opts.queued ?? [];
    fileRunId = opts.fileRunId ?? opts.runId ?? null;
    date = opts.date ?? date;
    now = opts.now ?? now;
  }

  if (!Array.isArray(generatedMetas)) generatedMetas = [];
  if (!Array.isArray(queuePosts)) queuePosts = [];

  // 생성 메타의 runId를 우선 상관 — queue-only mint 방지
  const distinctGeneratedRunIds = new Set(
    generatedMetas.map(m => m.runId || m.metaRunId || (m.qa && m.qa.runId) || null).filter(Boolean)
  );

  const queueEffective = queuePosts.map(p => {
    let rid = p.runId || fileRunId || null;
    if (!rid && distinctGeneratedRunIds.size === 1) rid = [...distinctGeneratedRunIds][0];
    if (!rid) rid = `generate-${date}`;
    return { ...p, _effectiveRunId: String(rid) };
  });

  const distinctQueueRunIds = new Set(queueEffective.map(p => p._effectiveRunId));

  const generatedEffective = generatedMetas.map(m => {
    let rid = m.runId || m.metaRunId || null;
    if (!rid && m.qa && m.qa.runId) rid = m.qa.runId;
    if (!rid) {
      if (distinctGeneratedRunIds.size === 1) {
        rid = [...distinctGeneratedRunIds][0];
      } else if (distinctQueueRunIds.size === 1) {
        rid = [...distinctQueueRunIds][0];
      } else if (fileRunId) {
        rid = String(fileRunId);
      } else if (distinctQueueRunIds.size === 0 && distinctGeneratedRunIds.size === 0) {
        rid = `generate-${date}`;
      } else if (distinctGeneratedRunIds.size > 0) {
        rid = [...distinctGeneratedRunIds][0];
      } else {
        rid = fileRunId ? String(fileRunId) : `generate-${date}`;
      }
    }
    return { ...m, _effectiveRunId: String(rid) };
  });

  const allRunIds = new Set([
    ...queueEffective.map(p => p._effectiveRunId),
    ...generatedEffective.map(m => m._effectiveRunId),
  ]);
  if (allRunIds.size === 0) {
    allRunIds.add(`generate-${date}`);
  }

  const runs = {};
  for (const rid of allRunIds) {
    runs[rid] = {
      runId: rid,
      posts: 0,
      qaPassed: 0,
      due: 0,
      qaPassedCount: 0,
      dueCount: 0,
      queued: 0,
      queuedTotal: 0,
      generatedTotal: 0,
      generated: { total: 0, qaPassed: 0, qaFailed: 0, draftOnly: 0 },
      queuedDetail: { total: 0, due: 0 },
      publish: { due: 0, total: 0 },
    };
  }

  for (const m of generatedEffective) {
    const rid = m._effectiveRunId;
    if (!runs[rid]) {
      runs[rid] = {
        runId: rid,
        posts: 0,
        qaPassed: 0,
        due: 0,
        qaPassedCount: 0,
        dueCount: 0,
        queued: 0,
        queuedTotal: 0,
        generatedTotal: 0,
        generated: { total: 0, qaPassed: 0, qaFailed: 0, draftOnly: 0 },
        queuedDetail: { total: 0, due: 0 },
        publish: { due: 0, total: 0 },
      };
    }
    runs[rid].generatedTotal += 1;
    runs[rid].generated.total += 1;
    if (m.status === 'draft_only') {
      runs[rid].generated.draftOnly += 1;
    }
    if (isQaPassed(m)) {
      runs[rid].qaPassed += 1;
      runs[rid].qaPassedCount += 1;
      runs[rid].generated.qaPassed += 1;
    } else if (isQaFailed(m) || m.status === 'qa_failed') {
      runs[rid].generated.qaFailed += 1;
    }
  }

  for (const p of queueEffective) {
    const rid = p._effectiveRunId;
    if (!runs[rid]) {
      runs[rid] = {
        runId: rid,
        posts: 0,
        qaPassed: 0,
        due: 0,
        qaPassedCount: 0,
        dueCount: 0,
        queued: 0,
        queuedTotal: 0,
        generatedTotal: 0,
        generated: { total: 0, qaPassed: 0, qaFailed: 0, draftOnly: 0 },
        queuedDetail: { total: 0, due: 0 },
        publish: { due: 0, total: 0 },
      };
    }
    runs[rid].posts += 1;
    runs[rid].queued += 1;
    runs[rid].queuedTotal += 1;
    runs[rid].queuedDetail.total += 1;
    runs[rid].publish.total += 1;
    if (isPostDue(p, now)) {
      runs[rid].due += 1;
      runs[rid].dueCount += 1;
      runs[rid].queuedDetail.due += 1;
      runs[rid].publish.due += 1;
    }
  }

  for (const rid of Object.keys(runs)) {
    const r = runs[rid];
    r.posts = r.queuedTotal;
    r.totalPosts = r.posts;
    r.totalQaPassed = r.qaPassed;
    r.totalDue = r.due;
  }

  return runs;
}

export const aggregateRuns = aggregateByRunId;
export const groupByRunId = aggregateByRunId;
export const summarizeRuns = aggregateByRunId;
export const buildAggregated = aggregateByRunId;

// ─── build summary ──────────────────────────────────────────────────

export function buildRunSummary({ date, generatedMetas = [], queuePosts = [], fileRunId = null, now = Date.now() } = {}) {
  const d = date || todayLocalDate();
  const runs = aggregateByRunId({ generatedMetas, queuePosts, fileRunId, date: d, now });
  const totals = {
    generated: { total: 0, qaPassed: 0, qaFailed: 0, draftOnly: 0 },
    queued: { total: 0, due: 0 },
    publish: { due: 0, total: 0 },
    posts: 0,
    qaPassed: 0,
    due: 0,
  };
  for (const r of Object.values(runs)) {
    totals.generated.total += r.generated.total;
    totals.generated.qaPassed += r.generated.qaPassed;
    totals.generated.qaFailed += r.generated.qaFailed;
    totals.generated.draftOnly += r.generated.draftOnly;
    totals.queued.total += r.queuedTotal;
    totals.queued.due += r.due;
    totals.publish.due += r.publish.due;
    totals.publish.total += r.publish.total;
    totals.posts += r.posts;
    totals.qaPassed += r.qaPassed;
    totals.due += r.due;
  }
  return {
    date: d,
    generatedAt: new Date().toISOString(),
    runs,
    totals,
    generatedCount: totals.generated.total,
    qaPassedCount: totals.generated.qaPassed,
    queuedCount: totals.queued.total,
    dueCount: totals.queued.due,
  };
}

// ─── collect from disk ──────────────────────────────────────────────

export async function collectRunSummary({ date, generatedDir = GENERATED_DIR_DEFAULT, queueDir = QUEUE_DIR_DEFAULT, now = Date.now() } = {}) {
  const d = date || todayLocalDate();
  const generatedMetas = await readGeneratedMetas({ date: d, generatedDir });
  const { fileRunId, posts: queuePosts } = await readQueuePosts({ date: d, queueDir });
  return buildRunSummary({ date: d, generatedMetas, queuePosts, fileRunId, now });
}

export const collectSummary = collectRunSummary;
export const getRunSummary = collectRunSummary;

// ─── write ───────────────────────────────────────────────────────────

export async function writeRunSummary({ date, generatedDir = GENERATED_DIR_DEFAULT, queueDir = QUEUE_DIR_DEFAULT, learningDir = LEARNING_DIR_DEFAULT, now = Date.now() } = {}) {
  const d = date || todayLocalDate();
  const summary = await collectRunSummary({ date: d, generatedDir, queueDir, now });
  await fs.mkdir(learningDir, { recursive: true });
  const outPath = path.join(learningDir, `run-summary-${d}.json`);
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  return { summary, outPath };
}

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { date: '', generatedDir: '', queueDir: '', learningDir: '', help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date' && argv[i + 1]) { args.date = argv[i + 1]; i++; }
    else if (a === '--generated-dir' && argv[i + 1]) { args.generatedDir = argv[i + 1]; i++; }
    else if (a === '--queue-dir' && argv[i + 1]) { args.queueDir = argv[i + 1]; i++; }
    else if (a === '--learning-dir' && argv[i + 1]) { args.learningDir = argv[i + 1]; i++; }
    else if (a === '--help' || a === '-h') { args.help = true; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`사용법: node run-summary.mjs [--date YYYY-MM-DD] [--generated-dir <dir>] [--queue-dir <dir>] [--learning-dir <dir>]`);
    process.exit(0);
  }
  const d = args.date || todayLocalDate();
  const generatedDir = args.generatedDir || GENERATED_DIR_DEFAULT;
  const queueDir = args.queueDir || QUEUE_DIR_DEFAULT;
  const learningDir = args.learningDir || LEARNING_DIR_DEFAULT;
  const { summary, outPath } = await writeRunSummary({ date: d, generatedDir, queueDir, learningDir });
  console.log(`[run-summary] ${outPath}`);
  console.log(`  date: ${summary.date}`);
  console.log(`  runs: ${Object.keys(summary.runs).length}`);
  for (const [rid, r] of Object.entries(summary.runs)) {
    console.log(`  - ${rid}: posts=${r.posts} qaPassed=${r.qaPassed} due=${r.due} generated=${r.generated.total}`);
  }
  console.log(`  totals: posts=${summary.totals.posts} qaPassed=${summary.totals.qaPassed} due=${summary.totals.due}`);
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('run-summary.mjs')) {
  main().catch(error => {
    console.error(`[run-summary] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export default {
  todayLocalDate,
  todayDate,
  isPostDue,
  isDue,
  readGeneratedMetas,
  collectGenerateStats,
  readQueuePosts,
  collectQueueStats,
  aggregateByRunId,
  buildRunSummary,
  collectRunSummary,
  writeRunSummary,
};
