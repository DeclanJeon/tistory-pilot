import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { FileBrowserLockStore } from '../../src/core/runtime/file-browser-lock-store.mjs';

test('browser lock store preserves active owner and allows stale takeover', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-lock-store-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const lockStore = new FileBrowserLockStore({ paths, now: () => new Date('2026-06-22T00:00:00.000Z') });

  const first = await lockStore.acquire({ ownerId: 'worker-a', jobId: 'job-a', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(first.acquired, true);

  const blocked = await lockStore.acquire({ ownerId: 'worker-b', jobId: 'job-b', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(blocked.acquired, false);

  await fs.writeFile(path.join(paths.locksDir, 'tistory-browser-lane.json'), JSON.stringify({
    key: 'tistory-browser-lane',
    ownerId: 'worker-a',
    jobId: 'job-a',
    acquiredAt: '2026-06-22T00:00:00.000Z',
    heartbeatAt: '2026-06-22T00:00:00.000Z',
    leaseMs: 90000,
    heartbeatMs: 30000,
    staleThresholdMs: 150000
  }, null, 2));
  const takeoverStore = new FileBrowserLockStore({ paths, now: () => new Date('2026-06-22T00:03:00.000Z') });
  const takeover = await takeoverStore.acquire({ ownerId: 'worker-b', jobId: 'job-b', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(takeover.acquired, true);
  assert.equal(takeover.staleTakeover, true);
});

test('browser lock token prevents stale owner release after takeover', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-lock-token-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const firstStore = new FileBrowserLockStore({ paths, now: () => new Date('2026-06-22T00:00:00.000Z') });
  const first = await firstStore.acquire({ ownerId: 'worker-a', jobId: 'job-a', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });

  const takeoverStore = new FileBrowserLockStore({ paths, now: () => new Date('2026-06-22T00:03:00.000Z') });
  const takeover = await takeoverStore.acquire({ ownerId: 'worker-b', jobId: 'job-b', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(takeover.acquired, true);

  const staleRelease = await firstStore.release({ ownerId: 'worker-a', expectedToken: first.lock.token });
  assert.equal(staleRelease.released, false);
  assert.equal(staleRelease.reason, 'owner-mismatch');
});

test('browser lock store recovers a stale mutation guard', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-lock-guard-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const guardPath = path.join(paths.locksDir, 'tistory-browser-lane.guard');
  await fs.writeFile(guardPath, 'stale');
  const staleAtMs = Date.parse('2026-06-22T00:00:00.000Z');
  await fs.utimes(guardPath, staleAtMs / 1000, staleAtMs / 1000);

  const lockStore = new FileBrowserLockStore({
    paths,
    now: () => new Date('2026-06-22T00:00:10.000Z'),
    sleep: async () => {}
  });
  const acquired = await lockStore.acquire({ ownerId: 'worker-a', jobId: 'job-a', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(acquired.acquired, true);
});

test('browser lock store removes corrupt lock records before acquire', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-lock-corrupt-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const lockPath = path.join(paths.locksDir, 'tistory-browser-lane.json');
  await fs.writeFile(lockPath, '');
  const lockStore = new FileBrowserLockStore({ paths, now: () => new Date('2026-06-22T00:00:00.000Z') });

  const acquired = await lockStore.acquire({ ownerId: 'worker-a', jobId: 'job-a', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(acquired.acquired, true);
  assert.equal(acquired.staleTakeover, false);
});

test('browser lock store rejects same-owner reacquire while the lock is still fresh', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-lock-same-owner-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const lockStore = new FileBrowserLockStore({ paths, now: () => new Date('2026-06-22T00:00:00.000Z') });

  const first = await lockStore.acquire({ ownerId: 'worker-a', jobId: 'job-a', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(first.acquired, true);

  const second = await lockStore.acquire({ ownerId: 'worker-a', jobId: 'job-b', leaseMs: 90000, heartbeatMs: 30000, staleThresholdMs: 150000 });
  assert.equal(second.acquired, false);
  assert.equal(second.lock.ownerId, 'worker-a');
});
