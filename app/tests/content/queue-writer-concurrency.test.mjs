/**
 * queue-writer-concurrency.test.mjs — 큐 파일 동시 쓰기 회귀 테스트
 * 실행: node --test tests/content/queue-writer-concurrency.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withQueueFileLock, writeJsonAtomic } from '../../scripts/lib/queue-store.mjs';
import { commitAutoQueueEntries } from '../../scripts/content/auto-queue.mjs';

const queueAddCli = fileURLToPath(new URL('../../scripts/schedule/queue-add.mjs', import.meta.url));
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const makeRoot = async () => fs.mkdtemp(path.join(os.tmpdir(), 'queue-writers-'));

function runQueueAdd({ queueDir, date, id, title, time = '09:00' }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      queueAddCli,
      '--queue-dir', queueDir,
      '--date', date,
      '--time', time,
      '--id', id,
      '--title', title,
      '--body', '<p>본문</p>'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

// queue-add를 자식 프로세스로 띄우되 fs.mkdir을 관찰용으로만 래핑한다:
// 락 디렉터리 mkdir이 EEXIST를 보는 순간(= 실제 락 경합) IPC로 'contended'를 보낸다.
// 원본 호출과 오류 전파는 그대로라 모든 파일시스템 동작은 실제다.
function queueAddContendHarnessSource({ argv, lockDir }) {
  return `
import { createRequire } from 'node:module';
const fs = createRequire(import.meta.url)('node:fs').promises;
const realMkdir = fs.mkdir;
const lockDir = ${JSON.stringify(lockDir)};
let reported = false;
fs.mkdir = async function contendedMkdir(...args) {
  try {
    return await realMkdir(...args);
  } catch (error) {
    if (!reported && error && error.code === 'EEXIST' && String(args[0]) === lockDir && process.send) {
      reported = true;
      process.send('contended');
    }
    throw error;
  }
};
process.argv = ${JSON.stringify(['node', 'queue-add', ...argv])};
await import(${JSON.stringify(new URL(`file:///${queueAddCli.replace(/\\/g, '/')}`).href)});
`;
}

function spawnHarness(harnessPath) {
  const child = spawn(process.execPath, [harnessPath], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', chunk => { out.stdout += chunk; });
  child.stderr.on('data', chunk => { out.stderr += chunk; });
  const exited = new Promise((resolve) => child.once('close', (code) => resolve(code)));
  const contended = new Promise((resolve) => child.once('message', (msg) => resolve(msg === 'contended')));
  return { child, out, exited, contended };
}

test('queue-add: 동시 추가들이 서로의 글을 유실하지 않는다', async (t) => {
  const root = await makeRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queueDir = path.join(root, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  const date = '2026-10-08';
  const queueFile = path.join(queueDir, `${date}.json`);
  await fs.writeFile(queueFile, JSON.stringify({
    runId: 'seed-run',
    posts: [{ id: 'seed', publishAt: `${date}T07:00:00+09:00` }]
  }));

  const adds = Array.from({ length: 6 }, (_, i) =>
    runQueueAdd({ queueDir, date, id: `manual-${i}`, title: `수동 등록 ${i}`, time: '12:00' }));
  for (const result of await Promise.all(adds)) {
    assert.equal(result.code, 0, result.stderr || result.stdout);
  }

  const final = await readJson(queueFile);
  assert.equal(final.runId, 'seed-run');
  const ids = final.posts.map(p => p.id).sort();
  assert.deepEqual(ids, ['manual-0', 'manual-1', 'manual-2', 'manual-3', 'manual-4', 'manual-5', 'seed']);
});

test('queue-add: 락 경합을 증명하고 점유 중 삭제된 글을 부활시키지 않는다', async (t) => {
  const root = await makeRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queueDir = path.join(root, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  const date = '2026-10-09';
  const queueFile = path.join(queueDir, `${date}.json`);
  await fs.writeFile(queueFile, JSON.stringify({
    runId: 'seed-run',
    posts: [
      { id: 'keep-1', publishAt: `${date}T09:00:00+09:00` },
      { id: 'remove-me', publishAt: `${date}T12:00:00+09:00` }
    ]
  }));

  const harness = path.join(queueDir, 'queue-add-contend-harness.mjs');
  await fs.writeFile(harness, queueAddContendHarnessSource({
    argv: [
      '--queue-dir', queueDir,
      '--date', date,
      '--time', '17:00',
      '--id', 'queue-add-new',
      '--title', '락 대기 후 추가',
      '--body', '<p>본문</p>'
    ],
    lockDir: `${queueFile}.lock`
  }), 'utf8');

  let acquired;
  let release;
  const acquiredPromise = new Promise((resolve) => { acquired = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const holder = withQueueFileLock(queueFile, async () => { acquired(); await gate; });
  let run = null;
  try {
    try {
      await acquiredPromise;

      // 점유 중 삭제 + 추가 (제출 이동/다른 writer 시뮬레이션)
      await writeJsonAtomic(queueFile, {
        runId: 'seed-run',
        posts: [
          { id: 'keep-1', publishAt: `${date}T09:00:00+09:00` },
          { id: 'in-lock-add', publishAt: `${date}T14:00:00+09:00` }
        ]
      });

      // 락 점유 확정 후에 자식을 띄운다 — 경합은 반드시 일어난다.
      run = spawnHarness(harness);
      // 타임아웃은 실패 가드일 뿐 정상 경로가 아니다.
      const result = await Promise.race([
        run.contended.then(ok => ({ type: 'contended', ok })),
        run.exited.then(code => ({ type: 'exit', code })),
        new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 15000))
      ]);
      if (result.type === 'exit') {
        assert.fail(`queue-add가 락 경합 전에 종료(code=${result.code}): ${run.out.stdout}\n${run.out.stderr}`);
      }
      if (result.type === 'timeout') {
        assert.fail('queue-add가 락 경합(EEXIST)을 관찰하지 못했다 — 락을 존중하지 않음');
      }
      assert.equal(result.ok, true, '락 디렉터리 EEXIST 경합이 관찰되어야 한다');

      // 락 점유 중에는 파일을 건드릴 수 없다.
      const during = await readJson(queueFile);
      assert.deepEqual(during.posts.map(p => p.id), ['keep-1', 'in-lock-add']);
    } finally {
      release();
      await holder.catch(() => {});
    }
  } catch (error) {
    run?.child.kill();
    throw error;
  }

  const code = await run.exited;
  assert.equal(code, 0, `${run.out.stdout}\n${run.out.stderr}`);
  const final = await readJson(queueFile);
  assert.deepEqual(final.posts.map(p => p.id), ['keep-1', 'in-lock-add', 'queue-add-new'],
    '점유 중 삭제된 remove-me가 부활하거나 in-lock-add가 유실되면 안 된다');
});

test('auto-queue 커밋: 락 점유 중 큐가 바뀌어도 추가·삭제·슬롯 상한을 보존한다', async (t) => {
  const root = await makeRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queueDir = path.join(root, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  const date = '2026-10-10';
  const queueFile = path.join(queueDir, `${date}.json`);
  const at = (hhmm) => `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00+09:00`;
  // 낡은 스냅샷 기준 0700은 3/4 — 커밋이 stale 큐를 쓰면 0700으로 배정된다.
  await fs.writeFile(queueFile, JSON.stringify({
    runId: 'seed-run',
    posts: [
      { id: 's1', publishAt: at('0700') },
      { id: 's2', publishAt: at('0700') },
      { id: 's3', publishAt: at('0700') },
      { id: 'remove-me', publishAt: at('0700') },
      { id: 'creative-1', contentTrack: 'ai-video', state: 'verified', publishAt: at('1200') }
    ]
  }));

  let release;
  let acquired;
  const gate = new Promise((resolve) => { release = resolve; });
  const acquiredPromise = new Promise((resolve) => { acquired = resolve; });
  const holder = withQueueFileLock(queueFile, async () => { acquired(); await gate; });
  let committed;
  try {
    await acquiredPromise;

    // 커밋은 락 대기 중에 시작된다 — 낡은 스냅샷을 읽을 기회가 없어야 한다.
    const commitPromise = commitAutoQueueEntries({
      queueFile,
      date,
      metaRunId: 'meta-run',
      selected: [{
        post: { id: 'new-generic', keyword: '동시성 테스트 글', category: '이사·청소·주거', title: '동시성 테스트 글' },
        selectionScore: 71.5,
        qaScore: 90
      }]
    });

    // 락 점유 중: s3·remove-me 삭제(제출 이동) + 0700을 상한(4)까지 채움 + 1400 추가
    await writeJsonAtomic(queueFile, {
      runId: 'seed-run',
      posts: [
        { id: 's1', publishAt: at('0700') },
        { id: 's2', publishAt: at('0700') },
        { id: 'manual-0700', publishAt: at('0700') },
        { id: 'manual-0700b', publishAt: at('0700') },
        { id: 'manual-1400', publishAt: at('1400') },
        { id: 'creative-1', contentTrack: 'ai-video', state: 'verified', publishAt: at('1200') }
      ]
    });
    release();
    await holder;

    committed = await commitPromise;
  } finally {
    release();
    await holder.catch(() => {});
  }
  assert.equal(committed.changed, true);
  assert.equal(committed.addedCount, 1);

  const final = await readJson(queueFile);
  assert.equal(final.runId, 'seed-run', '기존 큐 runId를 유지해야 한다');
  const ids = final.posts.map(p => p.id).sort();
  assert.deepEqual(ids, ['creative-1', 'manual-0700', 'manual-0700b', 'manual-1400', 'new-generic', 's1', 's2'],
    '삭제된 s3/remove-me는 부활하지 않고 락 안 추가분은 유실되지 않아야 한다');

  // 0700이 락 안 최신 큐에서 상한(4) 도달 — 0700 선호 카테고리도 0900으로 간다.
  const newPost = final.posts.find(p => p.id === 'new-generic');
  assert.equal(newPost.publishAt, at('0900'), 'stale 큐 기준이면 0700으로 배정되는 함정');
  assert.equal(newPost.selectionScore, 71.5);
  assert.equal(newPost.qaScore, 90);
  assert.equal(newPost.runId, 'seed-run', '새 글도 기존 큐 runId에 상관시킨다');
  const creative = final.posts.find(p => p.id === 'creative-1');
  assert.equal(creative.contentTrack, 'ai-video');
  assert.equal(creative.state, 'verified', 'creative 등록물은 그대로 보존되어야 한다');
});

test('auto-queue 커밋: 락 안에서 이미 등록된 id는 중복으로 넣지 않는다', async (t) => {
  const root = await makeRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queueDir = path.join(root, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  const date = '2026-10-11';
  const queueFile = path.join(queueDir, `${date}.json`);
  await fs.writeFile(queueFile, JSON.stringify({ runId: 'r1', posts: [{ id: 'keep', publishAt: `${date}T09:00:00+09:00` }] }));

  // 같은 선정분을 병렬로 두 번 커밋 — 둘째는 락 안 재읽기에서 id 충돌을 보고 skip.
  const selected = [{ post: { id: 'dup', keyword: '중복', category: 'IT·테크', title: '중복' }, selectionScore: 1, qaScore: 1 }];
  const [a, b] = await Promise.all([
    commitAutoQueueEntries({ queueFile, date, selected }),
    commitAutoQueueEntries({ queueFile, date, selected })
  ]);
  assert.equal(a.addedCount + b.addedCount, 1, '두 커밋 중 하나만 글을 추가해야 한다');
  const final = await readJson(queueFile);
  assert.deepEqual(final.posts.map(p => p.id).sort(), ['dup', 'keep']);
});

test('auto-queue 커밋: 병렬 커밋도 슬롯 상한을 넘기지 않는다', async (t) => {
  const root = await makeRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queueDir = path.join(root, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  const date = '2026-10-12';
  const queueFile = path.join(queueDir, `${date}.json`);
  const at = (hhmm) => `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00+09:00`;
  // 0700에 3/4 — 두 커밋이 동시에 stale 점유를 쓰면 0700이 5가 되는 함정.
  await fs.writeFile(queueFile, JSON.stringify({
    runId: 'seed-run',
    posts: [
      { id: 's1', publishAt: at('0700') },
      { id: 's2', publishAt: at('0700') },
      { id: 's3', publishAt: at('0700') }
    ]
  }));

  const mk = (id) => [{ post: { id, keyword: id, category: '이사·청소·주거', title: id }, selectionScore: 50, qaScore: 80 }];
  const [a, b] = await Promise.all([
    commitAutoQueueEntries({ queueFile, date, selected: mk('post-a') }),
    commitAutoQueueEntries({ queueFile, date, selected: mk('post-b') })
  ]);
  assert.equal(a.addedCount + b.addedCount, 2);

  const final = await readJson(queueFile);
  const atSlot = (hhmm) => final.posts.filter(p => p.publishAt === at(hhmm)).length;
  assert.equal(atSlot('0700'), 4, '0700 슬롯 상한(4)은 락 안 점유로 지켜져야 한다');
  assert.equal(atSlot('0900'), 1, '넘친 글은 다음 선호 슬롯(0900)으로 간다');
});
