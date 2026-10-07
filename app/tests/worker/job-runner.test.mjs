import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { WorkerJobRunner } from '../../src/worker/job-runner.mjs';

test('worker job runner requeues interrupted jobs on startup', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-recover-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-running', type: 'publish_post', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester', state: 'running' });

  const runner = new WorkerJobRunner({ config, paths, handlers: {} });
  const recovered = await runner.recoverInterruptedJobs();
  assert.deepEqual(recovered, ['job-running']);
  const job = await jobStore.get('job-running');
  assert.equal(job.state, 'queued');
});

test('worker job runner acquires browser lock and executes queued jobs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-exec-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-publish', type: 'publish_post', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester' });

  const runner = new WorkerJobRunner({
    config,
    paths,
    handlers: {
      async publish_post() {
        return { artifactRefs: ['artifact-1'], result: { ok: true } };
      }
    }
  });

  const result = await runner.runNextJob();
  assert.equal(result.state, 'succeeded');
  const job = await jobStore.get('job-publish');
  assert.equal(job.state, 'succeeded');
  assert.deepEqual(job.artifactRefs, ['artifact-1']);
});

test('worker job runner defers browser job when another owner holds the lock', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-lock-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-publish', type: 'publish_post', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester' });
  await fs.writeFile(path.join(paths.locksDir, 'tistory-browser-lane.json'), JSON.stringify({
    key: 'tistory-browser-lane',
    ownerId: 'other-worker',
    jobId: 'other-job',
    acquiredAt: '2026-06-22T00:00:00.000Z',
    heartbeatAt: '2026-06-22T00:00:00.000Z',
    leaseMs: 90000,
    heartbeatMs: 30000,
    staleThresholdMs: 150000
  }, null, 2));

  const runner = new WorkerJobRunner({
    config,
    paths,
    handlers: {
      async publish_post() {
        throw new Error('should not run');
      }
    },
    clock: () => new Date('2026-06-22T00:00:10.000Z')
  });

  const result = await runner.runNextJob();
  assert.equal(result.deferred, true);
  const job = await jobStore.get('job-publish');
  assert.equal(job.state, 'queued');
});

test('worker job runner heartbeats long-running browser locks', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-heartbeat-'));
  const config = createRuntimeConfig({
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data',
      PUBLISH_WORKBENCH_LOCK_HEARTBEAT_MS: '5'
    }
  });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-publish', type: 'publish_post', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester' });

  const runner = new WorkerJobRunner({
    config,
    paths,
    handlers: {
      async publish_post() {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { artifactRefs: [], result: { ok: true } };
      }
    },
    setIntervalFn(callback) {
      callback();
      return { id: 'heartbeat' };
    },
    clearIntervalFn() {}
  });

  await runner.runNextJob();
  const events = await fs.readFile(path.join(paths.eventsDir, 'job-publish.jsonl'), 'utf8');
  assert.match(events, /lock.heartbeat/);
});

test('worker job runner logs heartbeat errors without crashing the process', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-heartbeat-error-'));
  const config = createRuntimeConfig({
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data',
      PUBLISH_WORKBENCH_LOCK_HEARTBEAT_MS: '5'
    }
  });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-publish', type: 'publish_post', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester' });

  let heartbeatRun;
  const runner = new WorkerJobRunner({
    config,
    paths,
    handlers: {
      async publish_post() {
        return { artifactRefs: [], result: { ok: true } };
      }
    },
    lockStore: {
      async acquire() {
        return { acquired: true, staleTakeover: false, previousLock: null, lock: { token: 'token-1' } };
      },
      async heartbeat() {
        throw new Error('heartbeat-down');
      },
      async release() {
        return { released: true };
      }
    },
    setIntervalFn(callback) {
      heartbeatRun = callback();
      return { id: 'heartbeat' };
    },
    clearIntervalFn() {}
  });

  const result = await runner.runNextJob();
  await heartbeatRun;

  assert.equal(result.state, 'succeeded');
  const events = await fs.readFile(path.join(paths.eventsDir, 'job-publish.jsonl'), 'utf8');
  assert.match(events, /lock.heartbeat-error/);
  assert.doesNotMatch(events, /job.failed/);
});

test('worker job runner logs release-skipped when lock ownership changed before cleanup', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-release-skip-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-publish', type: 'publish_post', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester' });

  const runner = new WorkerJobRunner({
    config,
    paths,
    handlers: {
      async publish_post() {
        return { artifactRefs: [], result: { ok: true } };
      }
    },
    lockStore: {
      async acquire() {
        return { acquired: true, staleTakeover: false, previousLock: null, lock: { token: 'token-1' } };
      },
      async heartbeat() {
        return { renewed: true };
      },
      async release() {
        return { released: false, reason: 'token-mismatch' };
      }
    }
  });

  await runner.runNextJob();
  const events = await fs.readFile(path.join(paths.eventsDir, 'job-publish.jsonl'), 'utf8');
  assert.match(events, /lock.release-skipped/);
});

test('worker job runner executes a specific queued job by id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-jobid-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-specific', type: 'publish_post', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester' });

  const runner = new WorkerJobRunner({
    config,
    paths,
    handlers: {
      async publish_post() {
        return { artifactRefs: ['artifact-specific'], result: { ok: true } };
      }
    }
  });

  const result = await runner.runJobById('job-specific');
  assert.equal(result.state, 'succeeded');
  const job = await jobStore.get('job-specific');
  assert.deepEqual(job.artifactRefs, ['artifact-specific']);
});

test('worker job runner requeues a recoverable job before runJobById execution', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-runner-jobid-recover-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const jobStore = new FileJobStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });
  await jobStore.create({ jobId: 'job-recoverable', type: 'publish_post', state: 'waiting_for_qr', blogUrl: 'https://acstory.tistory.com', createdBy: 'tester' });

  const runner = new WorkerJobRunner({
    config,
    paths,
    handlers: {
      async publish_post() {
        return { artifactRefs: [], result: { ok: true } };
      }
    }
  });

  const result = await runner.runJobById('job-recoverable');
  assert.equal(result.state, 'succeeded');
  const events = await fs.readFile(path.join(paths.eventsDir, 'job-recoverable.jsonl'), 'utf8');
  assert.match(events, /job-worker-requeue/);
});
