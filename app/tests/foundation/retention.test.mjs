import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQrArtifactExpiry, computeStagedArtifactExpiry } from '../../src/core/artifacts/retention.mjs';

const retention = {
  qrSuccessGraceMs: 15 * 60 * 1000,
  qrTtlMs: 60 * 60 * 1000,
  qrFailureTtlMs: 30 * 60 * 1000,
  stagedSuccessTtlMs: 24 * 60 * 60 * 1000,
  stagedFailureTtlMs: 72 * 60 * 60 * 1000
};

test('qr expiry clamps login success grace to creation ttl', () => {
  const createdAt = '2026-06-22T00:00:00.000Z';
  const loginCompletedAt = '2026-06-22T00:55:00.000Z';

  assert.equal(
    computeQrArtifactExpiry({ createdAt, loginCompletedAt, retention }),
    '2026-06-22T01:00:00.000Z'
  );
});

test('qr failure expiry uses failure ttl', () => {
  assert.equal(
    computeQrArtifactExpiry({
      createdAt: '2026-06-22T00:00:00.000Z',
      failedAt: '2026-06-22T00:10:00.000Z',
      retention
    }),
    '2026-06-22T00:40:00.000Z'
  );
});

test('staged artifacts expire only after terminal states', () => {
  assert.equal(
    computeStagedArtifactExpiry({
      updatedAt: '2026-06-22T00:00:00.000Z',
      state: 'running',
      retention
    }),
    null
  );

  assert.equal(
    computeStagedArtifactExpiry({
      updatedAt: '2026-06-22T00:00:00.000Z',
      state: 'succeeded',
      retention
    }),
    '2026-06-23T00:00:00.000Z'
  );
});
