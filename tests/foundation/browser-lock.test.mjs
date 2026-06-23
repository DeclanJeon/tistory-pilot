import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTakeOverStaleLock,
  createBrowserLockRecord,
  isLeaseExpired,
  renewBrowserLock
} from '../../src/core/runtime/browser-lock.mjs';

test('browser lock lease and heartbeat rules follow the approved contract', () => {
  const lock = createBrowserLockRecord({
    ownerId: 'worker-a',
    jobId: 'job-1',
    acquiredAt: '2026-06-22T00:00:00.000Z',
    leaseMs: 90_000,
    heartbeatMs: 30_000,
    staleThresholdMs: 150_000
  });

  assert.equal(isLeaseExpired(lock, Date.parse('2026-06-22T00:01:29.999Z')), false);
  assert.equal(isLeaseExpired(lock, Date.parse('2026-06-22T00:01:30.000Z')), true);
  assert.equal(canTakeOverStaleLock(lock, Date.parse('2026-06-22T00:02:29.999Z')), false);
  assert.equal(canTakeOverStaleLock(lock, Date.parse('2026-06-22T00:02:30.000Z')), true);

  const renewed = renewBrowserLock(lock, '2026-06-22T00:01:00.000Z');
  assert.equal(isLeaseExpired(renewed, Date.parse('2026-06-22T00:02:20.000Z')), false);
});
