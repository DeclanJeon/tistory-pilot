import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUTH_EMAIL_CODE_TTL_MS,
  DEFAULT_LOCK_HEARTBEAT_MS,
  DEFAULT_LOCK_LEASE_MS,
  DEFAULT_QR_TTL_MS,
  DEFAULT_STAGED_FAILURE_TTL_MS,
  DEFAULT_STAGED_SUCCESS_TTL_MS,
  assertRuntimeEnvPolicy,
  assertWorkerBootstrapContract,
  createRuntimeConfig,
  listUnknownScopedEnvKeys
} from '../../src/core/runtime/config.mjs';

test('createRuntimeConfig uses only publish workbench scoped env', () => {
  const config = createRuntimeConfig({
    cwd: '/workspace/repo',
    env: {
      PUBLISH_WORKBENCH_APP_ENV: 'development',
      PUBLISH_WORKBENCH_DATA_ROOT: 'var/workbench',
      PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS: 'ops@ponslink.com',
      PUBLISH_WORKBENCH_QR_EMAIL_ALLOWED_RECIPIENTS: 'ops@ponslink.com,admin@ponslink.com'
    }
  });

  assert.equal(config.dataRoot, '/workspace/repo/var/workbench');
  assert.equal(config.lock.leaseMs, DEFAULT_LOCK_LEASE_MS);
  assert.equal(config.lock.heartbeatMs, DEFAULT_LOCK_HEARTBEAT_MS);
  assert.equal(config.retention.qrTtlMs, DEFAULT_QR_TTL_MS);
  assert.equal(config.retention.stagedSuccessTtlMs, DEFAULT_STAGED_SUCCESS_TTL_MS);
  assert.equal(config.retention.stagedFailureTtlMs, DEFAULT_STAGED_FAILURE_TTL_MS);
  assert.equal(config.authEmail.codeTtlMs, DEFAULT_AUTH_EMAIL_CODE_TTL_MS);
  assert.deepEqual(config.authEmail.allowedRecipients, ['ops@ponslink.com']);
  assert.deepEqual(config.qrEmail.allowedRecipients, ['ops@ponslink.com', 'admin@ponslink.com']);
});

test('production config rejects forbidden legacy env keys', () => {
  assert.throws(
    () => assertRuntimeEnvPolicy({
      PUBLISH_WORKBENCH_APP_ENV: 'production',
      TISTORY_ENV_FILE: '/tmp/legacy.env'
    }),
    /Forbidden production env keys present/
  );
});

test('production config requires explicit base url and session secret', () => {
  assert.throws(
    () => createRuntimeConfig({
      env: {
        PUBLISH_WORKBENCH_APP_ENV: 'production',
        PUBLISH_WORKBENCH_SESSION_SECRET: 'secret'
      }
    }),
    /PUBLISH_WORKBENCH_BASE_URL is required/
  );

  assert.throws(
    () => createRuntimeConfig({
      env: {
        PUBLISH_WORKBENCH_APP_ENV: 'production',
        PUBLISH_WORKBENCH_BASE_URL: 'https://publish.ponslink.com'
      }
    }),
    /PUBLISH_WORKBENCH_SESSION_SECRET is required/
  );
});

test('email auth config requires SMTP sender and recipients when enabled', () => {
  assert.throws(
    () => createRuntimeConfig({
      env: {
        PUBLISH_WORKBENCH_AUTH_EMAIL_ENABLED: '1',
        PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_HOST: 'smtp.example.com',
        PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS: 'ops@ponslink.com'
      }
    }),
    /PUBLISH_WORKBENCH_AUTH_EMAIL_FROM is required/
  );

  assert.throws(
    () => createRuntimeConfig({
      env: {
        PUBLISH_WORKBENCH_AUTH_EMAIL_ENABLED: '1',
        PUBLISH_WORKBENCH_AUTH_EMAIL_FROM: 'bot@ponslink.com',
        PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_HOST: 'smtp.example.com',
        PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS: 'ops@ponslink.com',
        PUBLISH_WORKBENCH_AUTH_EMAIL_CODE_TTL_MS: '30000'
      }
    }),
    /PUBLISH_WORKBENCH_AUTH_EMAIL_CODE_TTL_MS/
  );

  const config = createRuntimeConfig({
    env: {
      PUBLISH_WORKBENCH_AUTH_EMAIL_ENABLED: '1',
      PUBLISH_WORKBENCH_AUTH_EMAIL_FROM: 'bot@ponslink.com',
      PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_HOST: 'smtp.example.com',
      PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS: 'ops@ponslink.com',
      PUBLISH_WORKBENCH_AUTH_EMAIL_CODE_TTL_MS: '600000'
    }
  });
  assert.equal(config.authEmail.enabled, true);
  assert.equal(config.authEmail.from, 'bot@ponslink.com');
  assert.deepEqual(config.authEmail.allowedRecipients, ['ops@ponslink.com']);
});

test('unknown publish workbench env keys are rejected', () => {
  assert.deepEqual(
    listUnknownScopedEnvKeys({ PUBLISH_WORKBENCH_UNKNOWN_FLAG: '1' }),
    ['PUBLISH_WORKBENCH_UNKNOWN_FLAG']
  );

  assert.throws(
    () => createRuntimeConfig({
      env: { PUBLISH_WORKBENCH_UNKNOWN_FLAG: '1' }
    }),
    /Unknown PUBLISH_WORKBENCH_\* keys/
  );
});

test('worker bootstrap contract rejects payload argv and env', () => {
  assert.throws(
    () => assertWorkerBootstrapContract({
      argv: ['--job-id', 'job-1', '--title', 'bad'],
      env: { TISTORY_POST_BODY: 'nope' }
    }),
    /artifact-backed/
  );

  assert.throws(
    () => assertWorkerBootstrapContract({
      argv: [],
      env: {}
    }),
    /exactly `--job-id <value>`/
  );

  assert.throws(
    () => assertWorkerBootstrapContract({
      argv: ['--job-id', 'job-1', '--unexpected', '1'],
      env: {}
    }),
    /exactly `--job-id <value>`/
  );

  assert.doesNotThrow(() => assertWorkerBootstrapContract({
    argv: ['--job-id', 'job-1'],
    env: { PUBLISH_WORKBENCH_WORKER_ID: 'worker-1' }
  }));

  assert.doesNotThrow(() => assertWorkerBootstrapContract({
    argv: ['--once'],
    env: {},
    mode: 'queue-worker'
  }));
});
