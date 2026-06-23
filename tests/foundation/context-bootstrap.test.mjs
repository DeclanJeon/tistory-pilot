import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServerContext } from '../../src/server/context.mjs';
import { buildWorkerContext } from '../../src/worker/context.mjs';

test('server and worker contexts boot from scoped config without CLI env loaders', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-context-'));
  const options = {
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data'
    }
  };

  const serverContext = await buildServerContext(options);
  assert.match(serverContext.paths.jobsDir, /data\/jobs$/);

  const workerContext = await buildWorkerContext({
    ...options,
    argv: ['--job-id', 'job-1'],
    mode: 'job-worker'
  });
  assert.match(workerContext.paths.locksDir, /data\/runtime\/locks$/);
});
