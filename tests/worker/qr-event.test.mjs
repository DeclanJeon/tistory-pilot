import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { createWorkerHandlers } from '../../src/worker/handlers.mjs';
import { WorkerJobRunner } from '../../src/worker/job-runner.mjs';
import { stagePublishPayload } from '../../src/core/tistory/staged-payload-service.mjs';

test('publish jobs emit QR-ready events and persist QR artifacts from worker handlers', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-qr-event-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  const stagedPayload = await stagePublishPayload({
    artifactStore,
    jobId: 'job-publish',
    blogUrl: 'https://acstory.tistory.com',
    title: '제목',
    body: '본문'
  });
  const stagedRecord = await artifactStore.putJson({
    artifactId: 'staged-payload',
    value: stagedPayload,
    metadata: { kind: 'staged-publish-payload', jobId: 'job-publish' }
  });
  await jobStore.create({
    jobId: 'job-publish',
    type: 'publish_post',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    artifactRefs: [stagedRecord.artifactId]
  });

  const handlers = createWorkerHandlers({
    artifactStore,
    config,
    automation: {
      async publishPost(options) {
        await options.onQr?.({
          phase: 'initial',
          qrState: { dataUrl: 'data:image/png;base64,abcd', timeLeftSeconds: 42 }
        });
        await options.onQrResolved?.({ confirmedAt: '2026-06-22T00:05:00.000Z', method: 'kakao-qr' });
        return { published: true };
      }
    }
  });
  const runner = new WorkerJobRunner({ config, paths, handlers });
  await runner.runNextJob();

  const events = await fs.readFile(path.join(paths.eventsDir, 'job-publish.jsonl'), 'utf8');
  assert.match(events, /qr.ready/);
  assert.match(events, /qr.login-confirmed/);
  assert.doesNotMatch(events, /data:image\/png;base64,abcd/);

  const artifactEntries = await fs.readdir(paths.artifactMetaDir);
  assert.equal(artifactEntries.some(name => name.includes('qr-image')), true);
});
