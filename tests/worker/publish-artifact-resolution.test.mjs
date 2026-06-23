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

test('publish_post resolves title/body/category from staged artifact refs only', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-publish-resolution-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  const stagedPayload = await stagePublishPayload({
    artifactStore,
    jobId: 'job-publish-resolve',
    blogUrl: 'https://acstory.tistory.com',
    title: '제목',
    body: '본문',
    description: '설명',
    category: 'IT·테크',
    tags: 'AI,자동화'
  });
  const stagedRecord = await artifactStore.putJson({
    artifactId: 'staged-payload-resolve',
    value: stagedPayload,
    metadata: { kind: 'staged-publish-payload', jobId: 'job-publish-resolve' }
  });
  await jobStore.create({
    jobId: 'job-publish-resolve',
    type: 'publish_post',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    artifactRefs: [stagedRecord.artifactId]
  });

  let seen = null;
  const handlers = createWorkerHandlers({
    artifactStore,
    config,
    automation: {
      async publishPost(input) {
        seen = input;
        return { published: true };
      }
    }
  });
  const runner = new WorkerJobRunner({ config, paths, handlers });
  const result = await runner.runNextJob();

  assert.equal(result.state, 'succeeded');
  assert.equal(seen.title, '제목');
  assert.equal(seen.body, '본문');
  assert.equal(seen.description, '설명');
  assert.equal(seen.category, 'IT·테크');
  assert.equal(seen.tags, 'AI,자동화');
});

test('category_ensure resolves category from artifact ref only', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-category-resolution-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  const requestRecord = await artifactStore.putJson({
    artifactId: 'category-request-resolve',
    value: { category: '시사' },
    metadata: { kind: 'category-request', jobId: 'job-category-resolve' }
  });
  await jobStore.create({
    jobId: 'job-category-resolve',
    type: 'category_ensure',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    artifactRefs: [requestRecord.artifactId]
  });

  let seen = null;
  const handlers = createWorkerHandlers({
    artifactStore,
    config,
    automation: {
      async ensureCategory(input) {
        seen = input;
        return { ensured: true };
      }
    }
  });
  const runner = new WorkerJobRunner({ config, paths, handlers });
  const result = await runner.runNextJob();

  assert.equal(result.state, 'succeeded');
  assert.equal(seen.category, '시사');
  assert.equal(seen.blogUrl, 'https://acstory.tistory.com');
});
