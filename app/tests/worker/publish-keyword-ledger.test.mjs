import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { createWorkerHandlers } from '../../src/worker/handlers.mjs';
import { WorkerJobRunner } from '../../src/worker/job-runner.mjs';
import { stagePublishPayload } from '../../src/core/tistory/staged-payload-service.mjs';
import { loadPublishedLedger, savePublishedLedger } from '../../scripts/lib/published-posts.mjs';

const BLOG_URL = 'https://acstory.tistory.com';

// Real artifact staging: keywordId/keyword travel on the staged payload next to
// the provenance sourceBundle, which keeps its array shape untouched.
async function setupPublishJob(tempRoot, { jobId, title = '제목', keywordId = null, keyword = null, sourceBundle = [{ url: 'https://example.com/source', title: '공식 안내' }] } = {}) {
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-10-01T00:00:00.000Z' });
  const jobStore = new FileJobStore({ paths, now: () => '2026-10-01T00:00:00.000Z' });
  const stagedPayload = await stagePublishPayload({
    artifactStore,
    jobId,
    blogUrl: BLOG_URL,
    title,
    body: '본문',
    category: 'IT·테크',
    tags: 'AI',
    sourceBundle,
    keywordId,
    keyword
  });
  const stagedRecord = await artifactStore.putJson({
    artifactId: `staged-${jobId}`,
    value: stagedPayload,
    metadata: { kind: 'staged-publish-payload', jobId }
  });
  await jobStore.create({
    jobId,
    type: 'publish_post',
    blogUrl: BLOG_URL,
    createdBy: 'tester',
    artifactRefs: [stagedRecord.artifactId]
  });
  return { config, paths, artifactStore, jobStore };
}

async function withLedgerPath(ledgerPath, fn) {
  const previous = process.env.PUBLISHED_LEDGER_PATH;
  process.env.PUBLISHED_LEDGER_PATH = ledgerPath;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.PUBLISHED_LEDGER_PATH;
    else process.env.PUBLISHED_LEDGER_PATH = previous;
  }
}

test('publish_post success writes ledger with keyword identity, not jobId', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-keyword-ledger-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-keyword-ledger',
    title: '엔비디아 실적 정리',
    keywordId: 'news-20261008-01',
    keyword: '엔비디아 실적'
  });

  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          return { mode: 'publish', postId: '1201', postUrl: `${BLOG_URL}/1201` };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded');
  });

  const ledger = await loadPublishedLedger(ledgerPath);
  const entry = ledger.find(item => item.id === 'news-20261008-01');
  assert.ok(entry, 'ledger entry must be keyed by keywordId, not jobId');
  assert.equal(entry.keyword, '엔비디아 실적');
  assert.equal(entry.url, `${BLOG_URL}/1201`);
  assert.ok(!ledger.some(item => item.id === 'job-keyword-ledger'), 'jobId must not be the ledger id when keywordId exists');
});

test('publish_post failure does not reserve the topic in the ledger', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-keyword-fail-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore, jobStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-keyword-fail',
    title: '삼성전자 전망',
    keywordId: 'news-20261008-02',
    keyword: '삼성전자 전망'
  });

  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          throw new Error('automation failed before publish');
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.notEqual(result.state, 'succeeded');
  });

  const ledger = await loadPublishedLedger(ledgerPath).catch(() => []);
  assert.ok(!ledger.some(item => item.id === 'news-20261008-02'), 'failed publish must not reserve the keywordId');

  // 실패로 주제가 예약되지 않았으므로, 같은 토픽의 후속 작업은 정상 발행되어야 한다.
  const stagedPayload = await stagePublishPayload({
    artifactStore,
    jobId: 'job-keyword-retry',
    blogUrl: BLOG_URL,
    title: '삼성전자 전망',
    body: '본문',
    category: 'IT·테크',
    tags: 'AI',
    sourceBundle: [{ url: 'https://example.com/source', title: '공식 안내' }],
    keywordId: 'news-20261008-02',
    keyword: '삼성전자 전망'
  });
  const stagedRecord = await artifactStore.putJson({
    artifactId: 'staged-job-keyword-retry',
    value: stagedPayload,
    metadata: { kind: 'staged-publish-payload', jobId: 'job-keyword-retry' }
  });
  await jobStore.create({
    jobId: 'job-keyword-retry',
    type: 'publish_post',
    blogUrl: BLOG_URL,
    createdBy: 'tester',
    artifactRefs: [stagedRecord.artifactId]
  });

  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          return { mode: 'publish', postId: '1209', postUrl: `${BLOG_URL}/1209` };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded', 'same topic must still publish after a failed attempt');
  });
});

test('duplicate topic under a different keywordId is blocked before automation', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-dup-block-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-dup-topic',
    title: '엔비디아 실적 총정리 — AI network timeout 원인도 분석',
    keywordId: 'news-20261009-99',
    keyword: '엔비디아 실적'
  });
  // 같은 주제가 과거 다른 ID로 이미 발행된 원장.
  await savePublishedLedger([
    { id: 'news-20261001-01', keyword: '엔비디아 실적', title: '엔비디아 실적 발표 요약', url: `${BLOG_URL}/1001`, category: '', blogUrl: BLOG_URL, publishedAt: '2026-10-01T00:00:00.000Z' }
  ], ledgerPath);

  let publishCalls = 0;
  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          publishCalls += 1;
          return { mode: 'publish', postId: '1300', postUrl: `${BLOG_URL}/1300` };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'failed', 'duplicate topic must fail the job, not retry');
    assert.match(result.error || '', /duplicate topic blocked/);
  });

  assert.equal(publishCalls, 0, 'automation.publishPost must not run for a duplicate topic');
  const events = await fs.readFile(path.join(paths.eventsDir, 'job-dup-topic.jsonl'), 'utf8');
  assert.match(events, /ledger\.duplicate-blocked/, 'duplicate block must emit a ledger.duplicate-blocked event');
  const ledger = await loadPublishedLedger(ledgerPath);
  assert.equal(ledger.length, 1, 'blocked publish must not append to the ledger');
});

test('same source article under a rewritten headline is blocked', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-dup-source-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const sourceUrl = 'https://news.example.com/article/ai-chip-2026';
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-dup-source',
    title: 'AI 칩 시장 판도 분석',
    keywordId: 'news-20261010-01',
    keyword: 'AI 칩 시장',
    sourceBundle: [{ url: sourceUrl, title: 'AI chip market shifts' }]
  });
  // 같은 소스 기사가 과거 다른 제목/키워드로 발행된 원장.
  await savePublishedLedger([
    {
      id: 'news-20260928-03',
      keyword: '반도체 동향',
      title: '반도체 업계 주간 동향',
      url: `${BLOG_URL}/1002`,
      category: '',
      blogUrl: BLOG_URL,
      publishedAt: '2026-09-28T00:00:00.000Z',
      sourceBundle: [{ url: sourceUrl, title: 'AI chip market shifts' }]
    }
  ], ledgerPath);

  let publishCalls = 0;
  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          publishCalls += 1;
          return { mode: 'publish', postId: '1301', postUrl: `${BLOG_URL}/1301` };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'failed', 'same source article must fail the job');
    assert.match(result.error || '', /duplicate topic blocked/);
  });

  assert.equal(publishCalls, 0, 'automation.publishPost must not run for a duplicated source');
  const events = await fs.readFile(path.join(paths.eventsDir, 'job-dup-source.jsonl'), 'utf8');
  assert.match(events, /ledger\.duplicate-blocked/);
});

test('distinct new topic still publishes when the ledger has other entries', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-distinct-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-new-topic',
    title: '우주 탐사선 발사 일정',
    keywordId: 'news-20261010-77',
    keyword: '우주 탐사선 발사',
    sourceBundle: [{ url: 'https://space.example.com/launch-schedule', title: 'Launch schedule' }]
  });
  await savePublishedLedger([
    { id: 'news-20261001-01', keyword: '엔비디아 실적', title: '엔비디아 실적 발표 요약', url: `${BLOG_URL}/1001`, category: '', blogUrl: BLOG_URL, publishedAt: '2026-10-01T00:00:00.000Z', sourceBundle: [{ url: 'https://news.example.com/nv', title: 'NV' }] }
  ], ledgerPath);

  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          return { mode: 'publish', postId: '1400', postUrl: `${BLOG_URL}/1400` };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded');
  });

  const ledger = await loadPublishedLedger(ledgerPath);
  const entry = ledger.find(item => item.id === 'news-20261010-77');
  assert.ok(entry, 'new topic must be appended to the ledger');
  assert.equal(entry.url, `${BLOG_URL}/1400`);
});

test('legacy object sourceBundle still supplies id/keyword when keywordId absent', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-keyword-legacy-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-keyword-legacy',
    title: '레거시 번들',
    sourceBundle: { id: 'legacy-77', keyword: '레거시 키워드', url: 'https://example.com/a' }
  });

  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          return { mode: 'publish', postId: '1202', postUrl: `${BLOG_URL}/1202` };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded');
  });

  const ledger = await loadPublishedLedger(ledgerPath);
  const entry = ledger.find(item => item.id === 'legacy-77');
  assert.ok(entry, 'legacy object sourceBundle.id remains the fallback id');
  assert.equal(entry.keyword, '레거시 키워드');
});

test('array sourceBundle without keywordId falls back to jobId and title', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-keyword-fallback-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-keyword-fallback',
    title: '배열 번들 제목',
    sourceBundle: [{ url: 'https://example.com/b' }]
  });

  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => {},
        recordPublishFeedback: async () => {}
      },
      automation: {
        async publishPost() {
          return { mode: 'publish', postId: '1203', postUrl: `${BLOG_URL}/1203` };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded');
  });

  const ledger = await loadPublishedLedger(ledgerPath);
  const entry = ledger.find(item => item.id === 'job-keyword-fallback');
  assert.ok(entry, 'no keyword identity → ledger falls back to jobId');
  assert.equal(entry.keyword, '배열 번들 제목');
});
