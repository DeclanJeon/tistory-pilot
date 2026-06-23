import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';

test('file job store persists metadata and events under the data root', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-job-store-'));
  const config = createRuntimeConfig({
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data'
    }
  });
  const paths = await ensureDataPaths(config);
  const store = new FileJobStore({
    paths,
    now: () => '2026-06-22T00:00:00.000Z'
  });

  const created = await store.create({
    jobId: 'job-1',
    type: 'publish_post',
    blogUrl: 'https://publish.ponslink.com',
    createdBy: 'tester'
  });
  assert.equal(created.state, 'queued');

  const updated = await store.update('job-1', current => ({
    ...current,
    state: 'running',
    lockOwner: 'worker-1'
  }));
  assert.equal(updated.state, 'running');
  assert.equal(updated.lockOwner, 'worker-1');

  const jobFile = await fs.readFile(path.join(paths.jobsDir, 'job-1.json'), 'utf8');
  assert.match(jobFile, /"state": "running"/);

  const eventFile = await fs.readFile(path.join(paths.eventsDir, 'job-1.jsonl'), 'utf8');
  assert.match(eventFile, /job.created/);
});
