import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { JobService } from '../../src/server/job-service.mjs';
import { createWorkerHandlers } from '../../src/worker/handlers.mjs';
import { WorkerJobRunner } from '../../src/worker/job-runner.mjs';

for (const evidenceState of ['missing', 'tampered']) {
  test(`creative ${evidenceState} evidence is held before browser publication without retry`, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'creative-worker-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const config = createRuntimeConfig({ cwd: root, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
    config.publishedLedgerPath = path.join(root, 'published.json');
    const paths = await ensureDataPaths(config);
    const evidencePath = path.join(root, 'project.json');
    if (evidenceState === 'tampered') await fs.writeFile(evidencePath, JSON.stringify({ state: 'verified', assets: [] }));
    const service = new JobService({ config, paths });
    const job = await service.createPublishJob({
      createdBy: 'test', blogUrl: 'https://acstory.tistory.com',
      title: '유리병 매크로 광고 콘티', body: '<h1>유리병 매크로 광고 콘티</h1>',
      keywordId: 'ai-video-ad', keyword: 'AI 광고 영상 제작',
      contentTrack: 'ai-video', evidencePath, maxAttempts: 3
    });
    let browserCalls = 0;
    const handlers = createWorkerHandlers({
      artifactStore: new FileArtifactStore({ paths }), config,
      automation: { publishPost: async () => { browserCalls++; throw new Error('Browser must not be reached'); } },
      sinks: { notifyPublishResult: async () => {}, recordPublishFeedback: async () => {} }
    });
    const runner = new WorkerJobRunner({ config, paths, handlers });
    const result = await runner.runJobById(job.jobId);
    assert.equal(browserCalls, 0);
    assert.equal(result.state, 'failed');
    const stored = await service.getJob(job.jobId);
    assert.equal(stored.failureCode, 'creative-evidence-invalid');
    assert.equal(stored.nextAttemptAt, null);
  });
}
