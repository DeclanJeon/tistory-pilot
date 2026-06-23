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

test('draft_prepare stages payload from an artifact ref instead of inline worker payload', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-draft-prepare-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  const requestRecord = await artifactStore.putJson({
    artifactId: 'draft-request',
    value: {
      blogUrl: 'https://acstory.tistory.com',
      title: '제목',
      body: '본문'
    },
    metadata: { kind: 'draft-request', jobId: 'job-draft' }
  });
  await jobStore.create({
    jobId: 'job-draft',
    type: 'draft_prepare',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    artifactRefs: [requestRecord.artifactId]
  });

  const handlers = createWorkerHandlers({ artifactStore, config, automation: {} });
  const runner = new WorkerJobRunner({ config, paths, handlers });
  const result = await runner.runNextJob();
  assert.equal(result.state, 'succeeded');

  const events = await fs.readFile(path.join(paths.eventsDir, 'job-draft.jsonl'), 'utf8');
  assert.match(events, /job.succeeded/);
});
