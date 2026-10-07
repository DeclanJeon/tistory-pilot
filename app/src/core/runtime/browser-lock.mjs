export function createBrowserLockRecord({
  ownerId,
  jobId,
  acquiredAt,
  heartbeatAt = acquiredAt,
  leaseMs,
  heartbeatMs,
  staleThresholdMs
}) {
  if (!ownerId) throw new Error('ownerId is required.');
  if (!jobId) throw new Error('jobId is required.');
  if (!acquiredAt) throw new Error('acquiredAt is required.');

  return {
    key: 'tistory-browser-lane',
    ownerId,
    jobId,
    acquiredAt,
    heartbeatAt,
    leaseMs,
    heartbeatMs,
    staleThresholdMs
  };
}

export function isLeaseExpired(lock, now) {
  const heartbeatAtMs = new Date(lock.heartbeatAt).getTime();
  return heartbeatAtMs + lock.leaseMs <= now;
}

export function canTakeOverStaleLock(lock, now) {
  const heartbeatAtMs = new Date(lock.heartbeatAt).getTime();
  return heartbeatAtMs + lock.staleThresholdMs <= now;
}

export function renewBrowserLock(lock, heartbeatAt) {
  return {
    ...lock,
    heartbeatAt
  };
}
