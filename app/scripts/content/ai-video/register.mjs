/**
 * register.mjs — 검증 완료된 creative(ai-video) 글의 날짜별 큐 등록
 *
 * 일반 generate-post/auto-queue 경로와 분리된 전용 등록기다.
 * - contentTrack 'ai-video'만 허용하고 필수 필드(id/title/keyword/
 *   sourceBundle/bodyFile/heroImage/evidencePath/state)를 요구한다.
 * - publishAt은 +09:00 고정 오프셋 ISO이고 현재(now) 기준 최소 15분 뒤여야 한다.
 *   생략 시 now+15분을 다음 정분으로 올림한 시각을 부여한다.
 * - verifyCreativeEvidence를 통과해야만 큐에 닿는다. evidence 모듈 자체가
 *   없거나 오류면 fail-closed로 거부하며, 'already-queued' idempotent 반환도
 *   이 게이트 통과 후에만 일어나므로 변조 우회가 불가하다.
 * - 등록된 큐 엔트리의 state는 post.state를 그대로 믿지 않고 실제
 *   project.json에 바인딩된 'verified'로 정규화한다. project.state가
 *   producing/needs_review 등 미검증 상태면 거부한다.
 * - Seoul 날짜(publishAt 앞 10자리)당 최대 1건 — 큐 + submitted + failed
 *   기록을 합산해 검사하며 같은 날짜 큐 파일 락 안에서 재검사해 동시 등록에도
 *   상한이 지켜진다(failed 재시도는 같은 postId 바인딩으로만 허용).
 * - project.json에 registration 바인딩을 남겨 같은 프로젝트의 다른 글
 *   재제작/재등록을 막는다(같은 postId 재시도는 허용).
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { updateQueueFile, withQueueFileLock, writeJsonAtomic } from '../../lib/queue-store.mjs';
import { hasSourceUrls } from '../provenance-gate.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const DEFAULT_QUEUE_DIR = process.env.SCHEDULED_QUEUE_DIR
  || (existsSync('/srv/publish-workbench/scheduled/queue')
    ? '/srv/publish-workbench/scheduled/queue'
    : path.join(PROJECT_ROOT, 'scheduled', 'queue'));

const CONTENT_TRACK = 'ai-video';
const DAILY_CAP = 1;
const MIN_LEAD_MS = 15 * 60 * 1000;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
// publishAt은 +09:00 고정 오프셋만 허용 — Seoul 날짜 캡과 일치시키기 위함.
const PUBLISH_AT_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2})?\+09:00$/;
// 등록 가능한 실제 프로젝트 상태 — producing/needs_review 등 미검증은 거부.
const BINDABLE_PROJECT_STATES = new Set(['reviewed', 'verified', 'evidence_verified']);

/** epoch ms → 'YYYY-MM-DDTHH:mm:ss+09:00' (Asia/Seoul 고정 오프셋) */
export function toSeoulIso(ms) {
  return new Date(ms + SEOUL_OFFSET_MS).toISOString().slice(0, 19) + '+09:00';
}

function seoulDayOf(publishAt) {
  const m = PUBLISH_AT_RE.exec(String(publishAt || '').trim());
  return m ? m[1] : '';
}

function resolvePostPath(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadEvidenceVerifier() {
  const mod = await import('./evidence.mjs');
  if (typeof mod.verifyCreativeEvidence !== 'function') {
    throw new Error('verifyCreativeEvidence export missing');
  }
  return mod.verifyCreativeEvidence;
}

async function listJsonPosts(dir) {
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const posts = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
      for (const p of data.posts || []) {
        if (p && typeof p === 'object') posts.push(p);
      }
    } catch { /* 손상 큐 파일은 스캔에서 제외 */ }
  }
  return posts;
}

const isCreativePost = (p) => p && p.contentTrack === CONTENT_TRACK;

/**
 * 큐/보관 디렉터리에 기록된 creative 글 스캔 — 재생산 전 일 상한·등록 여부를
 * 호출부(generate-ai-video)가 미리 확인하는 용도. 읽기 전용.
 * @returns {Promise<{pending:object[], submitted:object[], failed:object[]}>}
 */
export async function scanCreativeQueue({ queueDir } = {}) {
  const queueRoot = path.resolve(queueDir || DEFAULT_QUEUE_DIR);
  const base = path.resolve(queueRoot, '..');
  const [pending, submitted, failed] = await Promise.all([
    listJsonPosts(queueRoot),
    listJsonPosts(path.join(base, 'submitted')),
    listJsonPosts(path.join(base, 'failed'))
  ]);
  return {
    pending: pending.filter(isCreativePost),
    submitted: submitted.filter(isCreativePost),
    failed: failed.filter(isCreativePost)
  };
}

/**
 * creative 글을 큐에 등록한다.
 * @param {object} args
 * @param {object} args.post — creative queue entry (스키마는 queue post와 동일 + contentTrack/evidencePath/state)
 * @param {string} [args.queueDir] — 날짜별 큐 디렉터리 (기본 SCHEDULED_QUEUE_DIR/서버 경로)
 * @param {number|Date} [args.now] — 판정 기준 시각 (테스트 주입용)
 * @param {Function} [args.verifyEvidence] — verifyCreativeEvidence 주입 (기본: ./evidence.mjs)
 * @returns {Promise<{registered:boolean, queueFile:string, reason?:string}>}
 */
export async function registerCreativePost({ post, queueDir, now, verifyEvidence } = {}) {
  const queueRoot = path.resolve(queueDir || DEFAULT_QUEUE_DIR);
  const nowMs = now instanceof Date ? now.getTime() : (Number.isFinite(now) ? Number(now) : Date.now());
  const reject = (reason) => ({ registered: false, queueFile: '', reason });

  if (!post || typeof post !== 'object') return reject('missing-post');
  if (post.contentTrack !== CONTENT_TRACK) {
    return reject(`invalid-contentTrack:${String(post.contentTrack ?? 'missing')}`);
  }
  for (const field of ['id', 'title', 'keyword', 'bodyFile', 'heroImage', 'evidencePath']) {
    if (!String(post[field] ?? '').trim()) return reject(`missing-field:${field}`);
  }
  // 호출부는 state(또는 status)를 넘긴다 — 저장 시에는 프로젝트 바인딩된
  // 'verified'로 정규화하므로 여기서는 필드 존재만 요구한다.
  if (!String(post.state || post.status || '').trim()) return reject('missing-field:state');
  if (!hasSourceUrls(post.sourceBundle)) return reject('missing-field:sourceBundle');

  // publishAt: +09:00 미래 시각 필수. 생략 시 now+15분을 다음 정분으로 부여.
  let publishAt = String(post.publishAt || '').trim();
  if (publishAt) {
    if (!PUBLISH_AT_RE.test(publishAt)) {
      return reject('invalid-publishAt:expected YYYY-MM-DDTHH:mm[:ss]+09:00');
    }
    if (Date.parse(publishAt) < nowMs + MIN_LEAD_MS) {
      return reject('publishAt-too-soon');
    }
  } else {
    publishAt = toSeoulIso(Math.ceil((nowMs + MIN_LEAD_MS) / 60_000) * 60_000);
  }
  const seoulDay = publishAt.slice(0, 10);
  const queueFile = path.join(queueRoot, `${seoulDay}.json`);
  const rejectAt = (reason) => ({ registered: false, queueFile, reason });

  const bodyPath = resolvePostPath(post.bodyFile);
  let bodyHtml;
  try {
    bodyHtml = await fs.readFile(bodyPath, 'utf8');
  } catch {
    return rejectAt('missing-file:bodyFile');
  }
  if (!(await pathExists(resolvePostPath(post.heroImage)))) {
    return rejectAt('missing-file:heroImage');
  }
  const evidencePath = resolvePostPath(post.evidencePath);

  // evidence tamper gate — 'already-queued' 반환보다 항상 먼저 실행해
  // 재제출 경로로 변조가 우회되지 않게 한다. 게이트 모듈 부재도 거부다.
  let verify = verifyEvidence;
  if (!verify) {
    try {
      verify = await loadEvidenceVerifier();
    } catch (error) {
      return rejectAt(`evidence-unavailable:${error?.code || error?.message || 'import-failed'}`);
    }
  }
  let gate;
  try {
    gate = await verify({ evidencePath, bodyHtml, projectRoot: PROJECT_ROOT, heroImagePath: resolvePostPath(post.heroImage) });
  } catch (error) {
    return rejectAt(`evidence-error:${error instanceof Error ? error.message : String(error)}`);
  }
  if (!gate || gate.ok !== true) {
    const details = Array.isArray(gate?.failures) ? gate.failures.join('; ').slice(0, 300) : 'no-details';
    return rejectAt(`evidence-failed:${details}`);
  }

  // 프로젝트 락은 날짜별 큐 커밋까지 유지한다. 다른 날짜 재등록도 같은
  // 프로젝트 락을 사용하므로 하나의 프로젝트가 두 큐에 들어갈 수 없다.
  try {
    return await withQueueFileLock(evidencePath, async () => {
      const project = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
      if (!project || typeof project !== 'object') return rejectAt('project-unreadable');
      if (project.registration?.postId && project.registration.postId !== post.id) {
        return rejectAt(`project-bound:${project.registration.postId}`);
      }
      if (!BINDABLE_PROJECT_STATES.has(project.state)) return rejectAt(`project-state-invalid:${project.state || 'missing'}`);
      const submittedDir = path.resolve(queueRoot, '..', 'submitted');
      const failedDir = path.resolve(queueRoot, '..', 'failed');
      let outcome = 'registered';
      let capCount = 0;
      let bindingChanged = false;
      try {
        await updateQueueFile(queueFile, async data => {
          const pending = await listJsonPosts(queueRoot);
          const submitted = await listJsonPosts(submittedDir);
          const queued = pending.find(entry => entry.id === post.id);
          const archived = submitted.find(entry => entry.id === post.id);
          const existing = queued || archived;
          if (existing && resolvePostPath(existing.evidencePath) !== evidencePath) {
            outcome = 'post-bound';
            return undefined;
          }
          if (existing) outcome = queued ? 'already-queued' : 'already-submitted';
          else {
            const failed = await listJsonPosts(failedDir);
            capCount = [...pending, ...submitted, ...failed].filter(entry =>
              isCreativePost(entry) && entry.id !== post.id && seoulDayOf(entry.publishAt) === seoulDay).length;
            if (capCount >= DAILY_CAP) {
              outcome = 'daily-cap';
              return undefined;
            }
          }
          const boundTime = existing?.publishAt || publishAt;
          if (project.state !== 'verified' || project.registration?.postId !== post.id || project.registration?.publishAt !== boundTime) {
            await writeJsonAtomic(evidencePath, {
              ...project, state: 'verified',
              registration: { postId: post.id, publishAt: boundTime, registeredAt: project.registration?.registeredAt || new Date(nowMs).toISOString() }
            });
            bindingChanged = true;
          }
          if (existing) return undefined;
          return {
            ...data,
            posts: [...(data?.posts || []), { ...post, publishAt, state: 'verified', contentTrack: CONTENT_TRACK }]
          };
        });
      } catch (error) {
        if (bindingChanged) await writeJsonAtomic(evidencePath, project);
        throw error;
      }
      if (outcome === 'daily-cap') return rejectAt(`daily-cap:${capCount}`);
      if (outcome === 'post-bound') return rejectAt('post-bound');
      return { registered: true, queueFile, reason: outcome };
    });
  } catch (error) {
    return rejectAt(`binding-failed:${error instanceof Error ? error.message : String(error)}`);
  }
}
