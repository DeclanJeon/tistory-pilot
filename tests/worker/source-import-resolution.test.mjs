import fs from 'node:fs/promises';
import http from 'node:http';
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

function startServer() {
  const pages = new Map([
    ['/a', '<html><head><title>Alpha</title><meta name="description" content="첫 설명" /></head><body><article><p>첫 문단이 충분히 길어서 분석된다. 반복 텍스트를 넣어서 길이를 늘린다. 첫 문단이 충분히 길어서 분석된다.</p><p>둘째 문단도 충분히 길다. 둘째 문단도 충분히 길다. 둘째 문단도 충분히 길다.</p></article></body></html>'],
    ['/b', '<html><head><title>Beta</title><meta name="description" content="둘 설명" /></head><body><article><p>세 번째 문단이 충분히 길어서 분석된다. 세 번째 문단이 충분히 길어서 분석된다.</p><p>네 번째 문단이 충분히 길어서 분석된다. 네 번째 문단이 충분히 길어서 분석된다.</p></article></body></html>']
  ]);
  const server = http.createServer((req, res) => {
    const body = pages.get(req.url);
    if (!body) {
      res.statusCode = 404;
      res.end('missing');
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(body);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('source_import resolves multi-link input from artifact refs and cleans staging output', async () => {
  const server = await startServer();
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-source-import-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  try {
    const linksRecord = await artifactStore.putText({
      artifactId: 'source-links-test',
      text: `${base}/a\n${base}/b`,
      metadata: { kind: 'source-links', jobId: 'job-source-import' }
    });
    await jobStore.create({
      jobId: 'job-source-import',
      type: 'source_import',
      blogUrl: 'https://acstory.tistory.com',
      createdBy: 'tester',
      artifactRefs: [linksRecord.artifactId]
    });

    const handlers = createWorkerHandlers({ artifactStore, config, automation: {} });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runNextJob();

    assert.equal(result.state, 'succeeded');
    const job = await jobStore.get('job-source-import');
    assert.equal(job.artifactRefs.length, 4);
    await assert.rejects(() => fs.stat(path.join(config.dataRoot, 'imports', 'job-source-import')));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
