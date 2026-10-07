import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { createWorkerHandlers, resolvePublishPostUrl } from '../../src/worker/handlers.mjs';
import { WorkerJobRunner } from '../../src/worker/job-runner.mjs';
import { stagePublishPayload } from '../../src/core/tistory/staged-payload-service.mjs';
import { loadPublishedLedger } from '../../scripts/lib/published-posts.mjs';

// agbrowse-automation needs playwright-core/linkedom which only exist on the
// worker host. Import lazily so handler-side regressions still run anywhere.
const automation = await import('../../src/worker/agbrowse-automation.mjs').catch(() => null);
const hasAutomation = Boolean(automation);

const BLOG_URL = 'https://acstory.tistory.com';

async function setupPublishJob(tempRoot, { jobId, title = '제목' } = {}) {
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
    tags: 'AI'
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

test('resolvePublishPostUrl returns the real public permalink and rejects manage URLs', () => {
  const options = { blogUrl: BLOG_URL };
  assert.equal(
    resolvePublishPostUrl({ postUrl: `${BLOG_URL}/1120`, postId: '1120' }, options),
    `${BLOG_URL}/1120`
  );
  assert.equal(
    resolvePublishPostUrl({ permalink: `${BLOG_URL}/entry/slug` }, options),
    `${BLOG_URL}/entry/slug`
  );
  // The observed broken artifact shape: ok publish, modal closed, only a
  // manager URL anywhere — must yield '' instead of the manage page.
  assert.equal(
    resolvePublishPostUrl({
      mode: 'publish',
      publishResult: {
        ok: true,
        modalClosed: true,
        url: `${BLOG_URL}/manage/posts/`
      },
      finalState: { url: `${BLOG_URL}/manage/posts/` }
    }, options),
    ''
  );
  assert.equal(resolvePublishPostUrl({ postUrl: `${BLOG_URL}/manage/newpost` }, options), '');
  assert.equal(resolvePublishPostUrl({ postUrl: `${BLOG_URL}/` }, options), '');
  assert.equal(resolvePublishPostUrl({ postUrl: `${BLOG_URL}/rss` }, options), '');
  assert.equal(resolvePublishPostUrl({ postUrl: `${BLOG_URL}/category/IT` }, options), '');
  assert.equal(resolvePublishPostUrl({ postUrl: `${BLOG_URL}/tag/ai` }, options), '');
  // 다른 티스토리 블로그나 외부 호스트의 URL은 절대 채택하지 않는다.
  assert.equal(resolvePublishPostUrl({ postUrl: 'https://other.tistory.com/1120' }, options), '');
  assert.equal(resolvePublishPostUrl({ postUrl: 'https://evil.example.com/1120' }, options), '');
  assert.equal(resolvePublishPostUrl(null, options), '');
  assert.equal(resolvePublishPostUrl(undefined, options), '');
});

test('publish_post success notification and ledger receive the real permalink', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-publish-permalink-'));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-permalink-real',
    title: 'AI 이미지 생성 프롬프트 예시 2026 총정리'
  });

  const notifications = [];
  const feedback = [];
  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async payload => { notifications.push(payload); },
        recordPublishFeedback: async payload => { feedback.push(payload); }
      },
      automation: {
        async publishPost() {
          return {
            mode: 'publish',
            postId: '1120',
            postUrl: `${BLOG_URL}/1120`,
            publishResult: {
              ok: true,
              modalClosed: true,
              url: `${BLOG_URL}/manage/posts/`
            }
          };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded');
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].postUrl, `${BLOG_URL}/1120`);
  assert.equal(feedback.length, 1);

  const ledger = await loadPublishedLedger(ledgerPath);
  const entry = ledger.find(item => item.id === 'job-permalink-real');
  assert.ok(entry, 'ledger entry must exist');
  assert.equal(entry.url, `${BLOG_URL}/1120`);
  assert.ok(!/\/manage(\/|$)/.test(entry.url), 'ledger url must never be a manage URL');
});

test('publish_post never leaks /manage/* URLs and skips empty-URL ledger write', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-publish-manage-url-'));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-permalink-manage-only',
    title: '관리자 URL만 있는 결과'
  });

  const notifications = [];
  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async payload => { notifications.push(payload); }
      },
      automation: {
        async publishPost() {
          return {
            mode: 'publish',
            publishResult: {
              ok: true,
              modalClosed: true,
              url: `${BLOG_URL}/manage/posts/`
            },
            finalState: { url: `${BLOG_URL}/manage/posts/` }
          };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded');
  });

  assert.equal(notifications[0].postUrl, '');

  // 실제 permalink를 확인하지 못한 성공은 빈 URL 원장을 다시 쌓지 않는다.
  const ledger = await loadPublishedLedger(ledgerPath);
  assert.equal(ledger.find(item => item.id === 'job-permalink-manage-only'), undefined);

  const events = await fs.readFile(path.join(paths.eventsDir, 'job-permalink-manage-only.jsonl'), 'utf8');
  assert.match(events, /ledger\.url-missing/);
});

test('notification failure cannot prevent the ledger write', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-publish-notify-fail-'));
  const ledgerPath = path.join(tempRoot, 'ledger', 'published.json');
  const { config, paths, artifactStore } = await setupPublishJob(tempRoot, {
    jobId: 'job-permalink-notify-fail',
    title: '알림 실패와 원장 격리'
  });

  const ledgerEntries = [];
  await withLedgerPath(ledgerPath, async () => {
    const handlers = createWorkerHandlers({
      artifactStore,
      config,
      sinks: {
        notifyPublishResult: async () => { throw new Error('discord down'); },
        appendPublishedLedger: async (entry, targetPath) => {
          ledgerEntries.push({ entry, targetPath });
        }
      },
      automation: {
        async publishPost() {
          return { mode: 'publish', postUrl: `${BLOG_URL}/1121`, postId: '1121' };
        }
      }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();
    assert.equal(result.state, 'succeeded');
  });
  assert.equal(ledgerEntries.length, 1, 'ledger sink must run even when notify throws');
  assert.equal(ledgerEntries[0].entry.url, `${BLOG_URL}/1121`);
  assert.equal(ledgerEntries[0].targetPath, ledgerPath);

  const events = await fs.readFile(path.join(paths.eventsDir, 'job-permalink-notify-fail.jsonl'), 'utf8');
  assert.match(events, /notify\.discord-error/);
});

test('post write tracker confirms only window writes and extracts the write response', { skip: !hasAutomation }, async () => {
  const listeners = new Map();
  const page = {
    on(event, handler) { listeners.set(event, handler); },
    off(event) { listeners.delete(event); },
    async waitForTimeout() {}
  };
  const tracker = automation.createTistoryPostWriteTracker(page);
  const emitResponse = async (url, body, status = 200) => {
    const request = { method: () => 'POST', url: () => url };
    listeners.get('request')?.(request);
    await listeners.get('response')?.({
      url: () => url,
      status: () => status,
      ok: () => status >= 200 && status < 300,
      text: async () => JSON.stringify(body),
      request: () => request
    });
  };

  // 에디터 autosave처럼 발행 클릭 이전에 발생한 write는 확인 신호가 아니다.
  await emitResponse(`${BLOG_URL}/manage/post.json`, { tistory: { status: '200', postId: '900' } });
  assert.equal(tracker.confirmed(), true);
  tracker.markWindowStart();
  assert.equal(tracker.confirmed(), false, 'pre-publish-window writes must not confirm the publish click');

  await emitResponse(
    `${BLOG_URL}/manage/post.json`,
    { tistory: { status: '200', postId: '1120', url: `${BLOG_URL}/1120` } }
  );
  await tracker.settled();
  assert.equal(tracker.confirmed(), true);
  const lastWrite = tracker.lastWrite();
  assert.equal(lastWrite.postId, '1120');
  assert.ok(lastWrite.urls.includes(`${BLOG_URL}/1120`));

  // 업로드/첨부 요청은 post write로 집계하지 않는다.
  tracker.markWindowStart();
  await emitResponse(`${BLOG_URL}/manage/post/attach.json`, { ok: true });
  assert.equal(tracker.confirmed(), false);
  tracker.dispose();
});

test('resolvePublishedPermalinkOnPage prefers the write response url', { skip: !hasAutomation }, async () => {
  const page = {
    url: () => `${BLOG_URL}/manage/posts/`,
    async evaluate() { throw new Error('must not hit the page when the write response has a url'); },
    async waitForTimeout() {}
  };
  const resolved = await automation.resolvePublishedPermalinkOnPage(page, {
    blogUrl: BLOG_URL,
    title: '제목',
    postWrite: { parsedBody: { tistory: { status: '200', postId: '1120', url: `${BLOG_URL}/1120` } } }
  });
  assert.equal(resolved.postUrl, `${BLOG_URL}/1120`);
  assert.equal(resolved.permalink, `${BLOG_URL}/1120`);
  assert.equal(resolved.postId, '1120');
  assert.equal(resolved.source, 'post-write-response');
});

test('resolvePublishedPermalinkOnPage falls back to posts.json lookup and postId url', { skip: !hasAutomation }, async () => {
  // write 응답에 postId만 있고 url이 없을 때: 글 관리 API → id 매칭 → 공개 url.
  const apiPage = {
    url: () => `${BLOG_URL}/manage/post/1120`,
    async evaluate(fn, arg) {
      assert.match(String(arg), /\/manage\/posts\.json/);
      return { items: [{ id: 1120, title: '다른 제목', postUrl: `${BLOG_URL}/1120` }, { id: 1119, title: '제목', postUrl: `${BLOG_URL}/1119` }] };
    },
    async waitForTimeout() {}
  };
  const viaApi = await automation.resolvePublishedPermalinkOnPage(apiPage, {
    blogUrl: BLOG_URL,
    title: '제목',
    postWrite: { parsedBody: { tistory: { status: '200', postId: '1120' } } }
  });
  assert.equal(viaApi.postUrl, `${BLOG_URL}/1120`, 'id 매칭이 title 매칭보다 우선한다');
  assert.equal(viaApi.source, 'manage-posts-api-id');

  // API 조회까지 실패하면 postId 기반 숫자 permalink로 폴백한다.
  const fallbackPage = {
    url: () => `${BLOG_URL}/manage/posts/`,
    async evaluate() { return null; },
    async waitForSelector() { throw new Error('list not rendered'); },
    async waitForTimeout() {}
  };
  const viaId = await automation.resolvePublishedPermalinkOnPage(fallbackPage, {
    blogUrl: BLOG_URL,
    title: '제목',
    postWrite: { parsedBody: { tistory: { status: '200', postId: '1120' } } }
  });
  assert.equal(viaId.postUrl, `${BLOG_URL}/1120`);
  assert.equal(viaId.source, 'post-id-redirect');
});

test('post write tracker does not confirm HTTP200 error bodies or non-write endpoints', { skip: !hasAutomation }, async () => {
  const listeners = new Map();
  const page = {
    on(event, handler) { listeners.set(event, handler); },
    off(event) { listeners.delete(event); },
    async waitForTimeout() {}
  };
  const tracker = automation.createTistoryPostWriteTracker(page);
  const emitResponse = async (url, body, status = 200) => {
    const request = { method: () => 'POST', url: () => url };
    listeners.get('request')?.(request);
    await listeners.get('response')?.({
      url: () => url,
      status: () => status,
      ok: () => status >= 200 && status < 300,
      text: async () => JSON.stringify(body),
      request: () => request
    });
  };

  tracker.markWindowStart();
  // HTTP 200이지만 에러 본문: 발행 확인이 아니다.
  await emitResponse(`${BLOG_URL}/manage/post.json`, { tistory: { status: '500', errorMessage: '로그인이 필요합니다' } });
  await emitResponse(`${BLOG_URL}/manage/post.json`, { isSuccess: false, errorMessage: '권한이 없습니다' });
  // 카테고리/목록 관련 엔드포인트는 post write로 집계하지 않는다.
  await emitResponse(`${BLOG_URL}/manage/category.json`, { id: 55 });
  await emitResponse(`${BLOG_URL}/manage/posts.json`, { ok: true });
  assert.equal(tracker.confirmed(), false, 'error bodies and non-write endpoints must not confirm');

  // 명시적 성공 본문이 있는 실제 write만 확인된다.
  await emitResponse(`${BLOG_URL}/manage/post.json`, { tistory: { status: '200' }, postId: '1122', url: `${BLOG_URL}/1122` });
  assert.equal(tracker.confirmed(), true);
  assert.equal(tracker.lastWrite().postId, '1122');
  tracker.dispose();
});

test('extractPublishedPostInfo ignores generic ids and wrong-host urls', { skip: !hasAutomation }, () => {
  // 범용 id(댓글/블로그/항목 id)는 postId로 추론하지 않는다.
  const generic = automation.extractPublishedPostInfo(
    { id: 777, blogId: 12345, comment: { id: 9 }, items: [{ id: 1 }] },
    { blogUrl: BLOG_URL }
  );
  assert.equal(generic.postId, null);

  // 다른 블로그 호스트의 url은 postUrl로 채택하지 않는다.
  const wrongHost = automation.extractPublishedPostInfo(
    { postId: '1120', url: 'https://other.tistory.com/1120' },
    { blogUrl: BLOG_URL }
  );
  assert.equal(wrongHost.postUrl, null);
  assert.equal(wrongHost.postId, '1120');

  // post.id 형태의 중첩 id는 postId로 인정한다.
  const nested = automation.extractPublishedPostInfo(
    { post: { id: 1120 }, url: `${BLOG_URL}/entry/my-post` },
    { blogUrl: BLOG_URL }
  );
  assert.equal(nested.postId, '1120');
  assert.equal(nested.postUrl, `${BLOG_URL}/entry/my-post`);

  // isSuccessfulPostWriteBody 계약: 성공 표시/글 정보 없는 본문은 미확인.
  assert.equal(automation.isSuccessfulPostWriteBody({ tistory: { status: '500' } }), false);
  assert.equal(automation.isSuccessfulPostWriteBody({ isSuccess: false }), false);
  assert.equal(automation.isSuccessfulPostWriteBody({}), false);
  assert.equal(automation.isSuccessfulPostWriteBody(null), false);
  assert.equal(automation.isSuccessfulPostWriteBody({ tistory: { status: '200' } }), true);
  assert.equal(automation.isSuccessfulPostWriteBody({ isSuccess: true }), true);
});
