/**
 * queue-store.test.mjs — 큐 저장소 락/원자 갱신 + creative 등록 게이트
 *
 * 실행: node --test tests/queue-store.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  updateQueueFile,
  withQueueFileLock,
  writeJsonAtomic,
  QueueLockTimeoutError
} from '../scripts/lib/queue-store.mjs';
import { registerCreativePost, scanCreativeQueue, toSeoulIso } from '../scripts/content/ai-video/register.mjs';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'queue-store-'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

// ─── queue-store ────────────────────────────────────────────────────

test('updateQueueFile: 동시 갱신은 서로의 글을 유실하지 않는다', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, '2026-10-07.json');
  const N = 12;
  await Promise.all(Array.from({ length: N }, (_, i) =>
    updateQueueFile(file, (data) => ({
      ...(data || {}),
      posts: [...(data?.posts || []), { id: `post-${i}` }]
    }))));
  const data = await readJson(file);
  assert.equal(data.posts.length, N);
  const ids = new Set(data.posts.map((p) => p.id));
  assert.equal(ids.size, N);
  for (let i = 0; i < N; i++) assert.ok(ids.has(`post-${i}`), `missing post-${i}`);
});

test('updateQueueFile: updater가 undefined를 반환하면 파일을 바꾸지 않는다', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, 'q.json');
  await updateQueueFile(file, () => ({ posts: [{ id: 'a' }] }));
  const before = await fs.readFile(file, 'utf8');
  const { changed, data } = await updateQueueFile(file, () => undefined);
  assert.equal(changed, false);
  assert.equal(data.posts.length, 1);
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('updateQueueFile: 손상된 큐 파일은 덮어쓰지 않고 오류를 전파한다', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, 'q.json');
  await fs.writeFile(file, '{broken json', 'utf8');
  await assert.rejects(() => updateQueueFile(file, () => ({ posts: [] })), /JSON/);
  assert.equal(await fs.readFile(file, 'utf8'), '{broken json');
});

test('withQueueFileLock: 점유 중에는 상한 안에서 타임아웃한다', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, 'q.json');
  let entered;
  let release;
  const acquired = new Promise(resolve => { entered = resolve; });
  const blocking = new Promise(resolve => { release = resolve; });
  const holder = withQueueFileLock(file, async () => { entered(); await blocking; });
  await acquired;
  try {
    await assert.rejects(
      () => withQueueFileLock(file, () => 'unreachable', { timeoutMs: 150, pollMs: 10 }),
      QueueLockTimeoutError
    );
  } finally {
    release();
    await holder;
  }
});

test('withQueueFileLock: 크래시로 남은 오래된 락은 회수한다', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, 'q.json');
  await fs.mkdir(`${file}.lock`); // 크래시 잔여 락 시뮬레이션
  const result = await updateQueueFile(file, (data) => ({ posts: [{ id: 'x' }] }), { staleMs: 0 });
  assert.equal(result.changed, true);
  assert.equal((await readJson(file)).posts[0].id, 'x');
  assert.equal(existsSync(`${file}.lock`), false, '락은 해제되어야 한다');
});

test('withQueueFileLock: 핸들러가 던져도 락이 해제된다', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, 'q.json');
  await assert.rejects(() => withQueueFileLock(file, () => { throw new Error('boom'); }));
  assert.equal(existsSync(`${file}.lock`), false);
  // 후속 갱신이 막히지 않는다
  const { changed } = await updateQueueFile(file, () => ({ posts: [{ id: 'a' }] }));
  assert.equal(changed, true);
});


// ─── registerCreativePost ───────────────────────────────────────────

const NOW = Date.parse('2026-10-07T00:00:00Z'); // = 2026-10-07 09:00 +09:00
const SEOUL_DAY = '2026-10-07';

async function makeCreativeFixture({ projectState = 'reviewed' } = {}) {
  const dir = await makeTmpDir();
  const queueDir = path.join(dir, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  const projectDir = path.join(dir, 'project');
  await fs.mkdir(projectDir, { recursive: true });
  const bodyFile = path.join(projectDir, 'article.html');
  const heroImage = path.join(projectDir, 'sheet.png');
  const evidencePath = path.join(projectDir, 'project.json');
  await fs.writeFile(bodyFile, '<h1>튜토리얼</h1><pre>prompt</pre>', 'utf8');
  await fs.writeFile(heroImage, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(evidencePath, JSON.stringify({ schemaVersion: 1, id: 'proj-1', state: projectState }), 'utf8');
  const future = toSeoulIso(NOW + 30 * 60 * 1000); // +30분 → 같은 Seoul 날짜
  const post = {
    id: 'aiv-proj-1',
    title: '두 고양이 버디 코미디 만들기',
    keyword: 'AI영상제작 튜토리얼',
    sourceBundle: [{ url: 'https://helpx.adobe.com/firefly/boards' }, { url: 'https://support.google.com/flow/answer/16352836' }],
    bodyFile,
    heroImage,
    evidencePath,
    contentTrack: 'ai-video',
    state: 'verified',
    publishAt: future,
    category: 'AI·P2P',
    status: 'qa_passed'
  };
  const okGate = async () => ({ ok: true, failures: [] });
  return { dir, queueDir, post, okGate, evidencePath };
}

test('registerCreativePost: 유효한 creative 글을 등록하고 프로젝트를 verified로 바인딩한다', async () => {
  const { queueDir, post, okGate, evidencePath } = await makeCreativeFixture();
  const res = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, true);
  assert.equal(res.reason, 'registered');
  const data = await readJson(res.queueFile);
  assert.equal(path.basename(res.queueFile), `${SEOUL_DAY}.json`);
  const entry = data.posts.find((p) => p.id === post.id);
  assert.ok(entry, '큐에 post가 있어야 한다');
  assert.equal(entry.contentTrack, 'ai-video');
  assert.equal(entry.state, 'verified');
  assert.equal(entry.evidencePath, post.evidencePath);
  const project = await readJson(evidencePath);
  assert.equal(project.state, 'verified');
  assert.equal(project.registration.postId, post.id);
  assert.equal(project.registration.publishAt, post.publishAt);
});

test('registerCreativePost: evidence 게이트 실패는 큐 등록과 바인딩을 모두 막는다', async () => {
  const { queueDir, post, evidencePath } = await makeCreativeFixture();
  const res = await registerCreativePost({
    post, queueDir, now: NOW,
    verifyEvidence: async () => ({ ok: false, failures: ['prompt-mismatch:scene-1'] })
  });
  assert.equal(res.registered, false);
  assert.match(res.reason, /^evidence-failed:/);
  assert.equal(existsSync(res.queueFile), false, '큐 파일이 생기면 안 된다');
  const project = await readJson(evidencePath);
  assert.equal(project.state, 'reviewed', '프로젝트 상태가 바뀌면 안 된다');
});

test('registerCreativePost: evidence 모듈 부재도 fail-closed다', async () => {
  const { queueDir, post } = await makeCreativeFixture();
  const res = await registerCreativePost({
    post, queueDir, now: NOW,
    verifyEvidence: async () => { throw new Error('boom'); }
  });
  assert.equal(res.registered, false);
  assert.match(res.reason, /^evidence-(unavailable|error|failed)/);
});

test('registerCreativePost: missing heroImage 파일은 거부한다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  post.heroImage = path.join(path.dirname(post.heroImage), 'nope.png');
  const res = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, false);
  assert.equal(res.reason, 'missing-file:heroImage');
});

test('registerCreativePost: publishAt 15분 리드와 +09:00 형식을 강제한다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  post.publishAt = '2026-10-07T10:00:00Z'; // Z 오프셋 거부
  assert.match((await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate })).reason, /^invalid-publishAt/);
  post.publishAt = toSeoulIso(NOW + 5 * 60 * 1000); // +5분 → 너무 이르다
  assert.equal((await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate })).reason, 'publishAt-too-soon');
  post.publishAt = 'not-a-date';
  assert.match((await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate })).reason, /^invalid-publishAt/);
  // publishAt 생략은 now+15분 이상으로 기본 부여된다
  post.publishAt = '';
  const res = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, true);
  const data = await readJson(res.queueFile);
  assert.ok(Date.parse(data.posts[0].publishAt) >= NOW + 15 * 60 * 1000);
  assert.match(data.posts[0].publishAt, /\+09:00$/);
});

test('registerCreativePost: 같은 post.id 재등록은 idempotent 성공이다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  const res = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, true);
  assert.equal(res.reason, 'already-queued');
  const data = await readJson(res.queueFile);
  assert.equal(data.posts.filter((p) => p.id === post.id).length, 1);
});

test('registerCreativePost: submitted에 있으면 재등록하지 않는다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  const submittedDir = path.join(path.dirname(queueDir), 'submitted');
  await fs.mkdir(submittedDir, { recursive: true });
  await writeJsonAtomic(path.join(submittedDir, `${post.id}-1.json`), { posts: [post] });
  const res = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, true);
  assert.equal(res.reason, 'already-submitted');
});

test('registerCreativePost: Seoul 날짜당 최대 1건 — 큐/제출/실패 기록 합산', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  const first = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(first.registered, true);
  // 다른 post.id로 같은 날짜에 등록 시도 → 상한
  const { post: second } = await makeCreativeFixture();
  second.id = 'aiv-proj-2';
  second.title = '다른 creative 글';
  const res = await registerCreativePost({ post: second, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, false);
  assert.match(res.reason, /^daily-cap:/);
  // 같은 날짜지만 failed에만 있던 creative도 상한에 포함된다
  const failedDir = path.join(path.dirname(queueDir), 'failed');
  await fs.mkdir(failedDir, { recursive: true });
  await writeJsonAtomic(path.join(failedDir, 'failed-old.json'), {
    posts: [{ id: 'aiv-old', contentTrack: 'ai-video', publishAt: `${SEOUL_DAY}T12:00:00+09:00` }]
  });
  const dayPosts = (await readJson(first.queueFile)).posts.length;
  assert.equal(dayPosts, 1);
});

test('registerCreativePost: 다른 postId 바인딩된 프로젝트는 거부한다', async () => {
  const { queueDir, post, okGate, evidencePath } = await makeCreativeFixture();
  await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  const other = { ...post, id: 'aiv-proj-1-v2', publishAt: toSeoulIso(NOW + 26 * 60 * 60 * 1000) };
  const res = await registerCreativePost({ post: other, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, false);
  assert.match(res.reason, /^project-bound:/);
  const project = await readJson(evidencePath);
  assert.equal(project.registration.postId, post.id);
});

test('registerCreativePost: 미검증 project.state(producing/needs_review)는 거부한다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture({ projectState: 'needs_review' });
  const res = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, false);
  assert.match(res.reason, /^project-state-invalid:needs_review$/);
});

test('registerCreativePost: 비creative와 필수 필드 누락은 거부한다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  const generic = { ...post, contentTrack: undefined };
  assert.match((await registerCreativePost({ post: generic, queueDir, now: NOW, verifyEvidence: okGate })).reason, /^invalid-contentTrack/);
  const noKeyword = { ...post, keyword: '' };
  assert.equal((await registerCreativePost({ post: noKeyword, queueDir, now: NOW, verifyEvidence: okGate })).reason, 'missing-field:keyword');
  const noSource = { ...post, sourceBundle: [] };
  assert.equal((await registerCreativePost({ post: noSource, queueDir, now: NOW, verifyEvidence: okGate })).reason, 'missing-field:sourceBundle');
  const noState = { ...post, state: '', status: '' };
  assert.equal((await registerCreativePost({ post: noState, queueDir, now: NOW, verifyEvidence: okGate })).reason, 'missing-field:state');
});

test('registerCreativePost: 기존 비creative 큐 글을 보존한다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  const queueFile = path.join(queueDir, `${SEOUL_DAY}.json`);
  await writeJsonAtomic(queueFile, { runId: 'run-1', posts: [{ id: 'generic-1', publishAt: `${SEOUL_DAY}T07:00:00+09:00` }] });
  const res = await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  assert.equal(res.registered, true);
  const data = await readJson(queueFile);
  assert.equal(data.runId, 'run-1');
  assert.deepEqual(data.posts.map((p) => p.id).sort(), ['aiv-proj-1', 'generic-1']);
});

test('registerCreativePost: 같은 날짜 동시 등록 경합에서도 상한 1건이 지켜진다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  // 같은 프로젝트 바인딩을 피하려고 각 post는 별도 project.json을 가리킨다.
  const makePost = (i) => {
    const evidencePath = post.evidencePath.replace('project.json', `project-${i}.json`);
    return fs.writeFile(evidencePath, JSON.stringify({ schemaVersion: 1, id: `proj-${i}`, state: 'reviewed' }), 'utf8')
      .then(() => ({ ...post, id: `aiv-race-${i}`, evidencePath }));
  };
  const posts = await Promise.all([makePost(1), makePost(2), makePost(3)]);
  const results = await Promise.all(posts.map((p) => registerCreativePost({ post: p, queueDir, now: NOW, verifyEvidence: okGate })));
  const ok = results.filter((r) => r.registered);
  const capped = results.filter((r) => !r.registered && /^daily-cap/.test(r.reason || ''));
  assert.equal(ok.length, 1, `정확히 1건만 등록되어야 한다: ${JSON.stringify(results)}`);
  assert.equal(capped.length, posts.length - 1);
  const data = await readJson(path.join(queueDir, `${SEOUL_DAY}.json`));
  assert.equal(data.posts.length, 1);
});

test('scanCreativeQueue: pending/submitted/failed의 creative 글을 구분해 읽는다', async () => {
  const { queueDir, post, okGate } = await makeCreativeFixture();
  await registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate });
  const base = path.dirname(queueDir);
  await fs.mkdir(path.join(base, 'submitted'), { recursive: true });
  await fs.mkdir(path.join(base, 'failed'), { recursive: true });
  await writeJsonAtomic(path.join(base, 'submitted', 's.json'), { posts: [{ id: 'aiv-done', contentTrack: 'ai-video' }, { id: 'g1' }] });
  await writeJsonAtomic(path.join(base, 'failed', 'f.json'), { posts: [{ id: 'aiv-bad', contentTrack: 'ai-video' }] });
  const scan = await scanCreativeQueue({ queueDir });
  assert.deepEqual(scan.pending.map((p) => p.id), ['aiv-proj-1']);
  assert.deepEqual(scan.submitted.map((p) => p.id), ['aiv-done']);
  assert.deepEqual(scan.failed.map((p) => p.id), ['aiv-bad']);
});

test('cross-date concurrent registration commits one queue entry with its original binding', async () => {
  const { queueDir, post, okGate, evidencePath } = await makeCreativeFixture();
  const later = { ...post, publishAt: toSeoulIso(NOW + 26 * 60 * 60 * 1000) };
  const results = await Promise.all([
    registerCreativePost({ post, queueDir, now: NOW, verifyEvidence: okGate }),
    registerCreativePost({ post: later, queueDir, now: NOW, verifyEvidence: okGate })
  ]);
  assert.ok(results.every(result => result.registered));
  const { pending } = await scanCreativeQueue({ queueDir });
  assert.deepEqual(pending.map(entry => entry.id), [post.id]);
  const project = await readJson(evidencePath);
  assert.equal(project.registration.publishAt, pending[0].publishAt);
});

test('a daily-cap rejection leaves the other project unbound', async () => {
  const first = await makeCreativeFixture();
  const second = await makeCreativeFixture();
  second.post.id = 'another-project';
  await registerCreativePost({ post: first.post, queueDir: first.queueDir, now: NOW, verifyEvidence: first.okGate });
  const result = await registerCreativePost({ post: second.post, queueDir: first.queueDir, now: NOW, verifyEvidence: second.okGate });
  assert.equal(result.registered, false);
  assert.equal((await readJson(second.evidencePath)).registration, undefined);
});

test('concurrent stale-lock reclamation preserves every writer without overlapping updaters', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, 'queue.json');
  await fs.mkdir(`${file}.lock`);
  await fs.utimes(`${file}.lock`, new Date(0), new Date(0));
  let active = 0;
  let overlapped = false;
  const ids = Array.from({ length: 10 }, (_, index) => `post-${index}`);
  await Promise.all(ids.map(id => updateQueueFile(file, async data => {
    if (++active !== 1) overlapped = true;
    await sleep(5);
    active--;
    return { posts: [...(data?.posts || []), { id }] };
  }, { staleMs: 50 })));
  assert.equal(overlapped, false);
  assert.deepEqual((await readJson(file)).posts.map(post => post.id).sort(), ids.sort());
});

test('an old directory timestamp cannot expire a lock held by a live owner', async () => {
  const dir = await makeTmpDir();
  const file = path.join(dir, 'queue.json');
  let entered;
  let release;
  const acquired = new Promise(resolve => { entered = resolve; });
  const blocking = new Promise(resolve => { release = resolve; });
  const holder = withQueueFileLock(file, async () => { entered(); await blocking; });
  await acquired;
  await fs.utimes(`${file}.lock`, new Date(0), new Date(0));
  try {
    await assert.rejects(() => withQueueFileLock(file, () => {}, { timeoutMs: 100, staleMs: 1, pollMs: 10 }), QueueLockTimeoutError);
  } finally {
    release();
    await holder;
  }
});
