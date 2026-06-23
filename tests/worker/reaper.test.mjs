import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { clearExpiredQrFiles, reapExpiredArtifacts } from '../../src/worker/reaper.mjs';


test('reaper deletes expired staged payload artifacts after terminal jobs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-reaper-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const now = () => '2026-06-25T00:00:00.000Z';
  const jobStore = new FileJobStore({ paths, now });
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  await jobStore.create({
    jobId: 'job-1',
    type: 'publish_post',
    state: 'succeeded',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    updatedAt: '2026-06-22T00:00:00.000Z'
  });

  await artifactStore.putJson({
    artifactId: 'staged-1',
    value: { ok: true },
    metadata: { kind: 'staged-publish-payload', jobId: 'job-1' }
  });

  const removed = await reapExpiredArtifacts({ config, paths, now });
  assert.equal(removed[0].artifactId, 'staged-1');
});

test('reaper deletes staged child artifacts after terminal publish state', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-reaper-stage-child-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const now = () => '2026-06-25T00:00:00.000Z';
  const jobStore = new FileJobStore({ paths, now });
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  await jobStore.create({
    jobId: 'job-stage-child',
    type: 'publish_post',
    state: 'succeeded',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    updatedAt: '2026-06-22T00:00:00.000Z'
  });

  await artifactStore.putText({
    artifactId: 'publish-title-1',
    text: '제목',
    metadata: { kind: 'publish-title', jobId: 'job-stage-child' }
  });

  const removed = await reapExpiredArtifacts({ config, paths, now });
  assert.equal(removed[0].artifactId, 'publish-title-1');
});

test('reaper deletes QR artifacts 15 minutes after QR login confirmation even if publish finishes later', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-reaper-qr-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const now = () => '2026-06-22T00:21:00.000Z';
  const jobStore = new FileJobStore({ paths, now });
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  await jobStore.create({
    jobId: 'job-qr',
    type: 'publish_post',
    state: 'succeeded',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    updatedAt: '2026-06-22T00:30:00.000Z'
  });
  await jobStore.appendEvent('job-qr', {
    at: '2026-06-22T00:05:00.000Z',
    type: 'qr.login-confirmed',
    detail: { confirmedAt: '2026-06-22T00:05:00.000Z', method: 'kakao-qr' }
  });

  await artifactStore.putText({
    artifactId: 'qr-1',
    text: 'data:image/png;base64,abcd',
    metadata: {
      kind: 'qr-image',
      jobId: 'job-qr',
      expiresAt: '2026-06-22T01:00:00.000Z'
    }
  });

  const removed = await reapExpiredArtifacts({ config, paths, now });
  assert.equal(removed[0].artifactId, 'qr-1');
});


test('raw QR files follow QR login confirmation timing instead of final publish time', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-reaper-qr-file-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const now = () => '2026-06-22T00:21:00.000Z';
  const jobStore = new FileJobStore({ paths, now });

  await jobStore.create({
    jobId: 'job-qr-file',
    type: 'publish_post',
    state: 'succeeded',
    blogUrl: 'https://acstory.tistory.com',
    createdBy: 'tester',
    updatedAt: '2026-06-22T00:30:00.000Z'
  });
  await jobStore.appendEvent('job-qr-file', {
    at: '2026-06-22T00:05:00.000Z',
    type: 'qr.login-confirmed',
    detail: { confirmedAt: '2026-06-22T00:05:00.000Z', method: 'kakao-qr' }
  });

  const qrFilePath = path.join(paths.qrDir, 'job-qr-file.png');
  await fs.writeFile(qrFilePath, 'qr');
  const createdAtMs = Date.parse('2026-06-22T00:00:00.000Z');
  await fs.utimes(qrFilePath, createdAtMs / 1000, createdAtMs / 1000);

  const removed = await clearExpiredQrFiles({ config, paths, now });
  assert.deepEqual(removed, [qrFilePath]);
});
