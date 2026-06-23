import path from 'node:path';

export const ALLOWED_ENV_KEYS = Object.freeze([
  'PUBLISH_WORKBENCH_APP_ENV',
  'PUBLISH_WORKBENCH_DATA_ROOT',
  'PUBLISH_WORKBENCH_BASE_URL',
  'PUBLISH_WORKBENCH_LOG_LEVEL',
  'PUBLISH_WORKBENCH_SESSION_SECRET',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_ENABLED',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_FROM',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_HOST',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_PORT',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_SECURE',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_USER',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_PASS',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS',
  'PUBLISH_WORKBENCH_AUTH_EMAIL_CODE_TTL_MS',
  'PUBLISH_WORKBENCH_WEB_HOST',
  'PUBLISH_WORKBENCH_WEB_PORT',
  'PUBLISH_WORKBENCH_WEB_TRUST_PROXY',
  'PUBLISH_WORKBENCH_WORKER_ID',
  'PUBLISH_WORKBENCH_WORKER_POLL_MS',
  'PUBLISH_WORKBENCH_BROWSER_PROFILE_DIR',
  'PUBLISH_WORKBENCH_BROWSER_HEADLESS',
  'PUBLISH_WORKBENCH_LOCK_LEASE_MS',
  'PUBLISH_WORKBENCH_LOCK_HEARTBEAT_MS',
  'PUBLISH_WORKBENCH_STAGED_SUCCESS_TTL_MS',
  'PUBLISH_WORKBENCH_STAGED_FAILURE_TTL_MS',
  'PUBLISH_WORKBENCH_QR_TTL_MS',
  'PUBLISH_WORKBENCH_QR_EMAIL_ENABLED',
  'PUBLISH_WORKBENCH_QR_EMAIL_FROM',
  'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_HOST',
  'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_PORT',
  'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_SECURE',
  'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_USER',
  'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_PASS',
  'PUBLISH_WORKBENCH_QR_EMAIL_ALLOWED_RECIPIENTS'
]);

export const FORBIDDEN_PRODUCTION_ENV_KEYS = Object.freeze([
  'TISTORY_ENV_FILE',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'EMAIL_FROM',
  'PONSLINK_PROVIDER_DASHBOARD_OWNER_EMAIL',
  'CONTACT_EMAIL'
]);

export const PAYLOAD_ENV_KEYS = Object.freeze([
  'TISTORY_POST_TITLE',
  'TISTORY_POST_BODY',
  'TISTORY_POST_BODY_FILE',
  'TISTORY_POST_DESCRIPTION',
  'TISTORY_POST_TAGS',
  'TISTORY_POST_CATEGORY',
  'TISTORY_POST_HERO_IMAGE',
  'TISTORY_SOURCE_URL',
  'TISTORY_SOURCE_URLS',
  'TISTORY_QR_EMAIL_TO'
]);

export const DEFAULT_LOCK_LEASE_MS = 90_000;
export const DEFAULT_LOCK_HEARTBEAT_MS = 30_000;
export const DEFAULT_STALE_THRESHOLD_MS = 150_000;
export const DEFAULT_STAGED_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_STAGED_FAILURE_TTL_MS = 72 * 60 * 60 * 1000;
export const DEFAULT_QR_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_AUTH_EMAIL_CODE_TTL_MS = 10 * 60 * 1000;

function readString(env, key, fallback = '') {
  const value = env[key];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim();
}

function readBoolean(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  throw new Error(`${key} must be a boolean-like value.`);
}

function readInteger(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
  return parsed;
}

function readRecipients(env, key) {
  return readString(env, key)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export function listUnknownScopedEnvKeys(env = process.env) {
  return Object.keys(env)
    .filter(key => key.startsWith('PUBLISH_WORKBENCH_') && !ALLOWED_ENV_KEYS.includes(key))
    .sort();
}

export function listForbiddenProductionEnvKeys(env = process.env) {
  return FORBIDDEN_PRODUCTION_ENV_KEYS.filter(key => {
    const value = env[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

export function assertRuntimeEnvPolicy(env = process.env, options = {}) {
  const appEnv = readString(env, 'PUBLISH_WORKBENCH_APP_ENV', options.defaultAppEnv || 'development');
  const unknownScopedKeys = listUnknownScopedEnvKeys(env);
  if (unknownScopedKeys.length > 0) {
    throw new Error(`Unknown PUBLISH_WORKBENCH_* keys: ${unknownScopedKeys.join(', ')}`);
  }

  if (appEnv === 'production') {
    const forbiddenKeys = listForbiddenProductionEnvKeys(env);
    if (forbiddenKeys.length > 0) {
      throw new Error(`Forbidden production env keys present: ${forbiddenKeys.join(', ')}`);
    }
  }

  return { appEnv, unknownScopedKeys: [], forbiddenKeys: [] };
}

export function createRuntimeConfig(options = {}) {
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const { appEnv } = assertRuntimeEnvPolicy(env, options);

  const dataRoot = path.resolve(cwd, readString(env, 'PUBLISH_WORKBENCH_DATA_ROOT', 'tmp/publish-workbench'));
  const browserProfileDir = path.resolve(dataRoot, readString(env, 'PUBLISH_WORKBENCH_BROWSER_PROFILE_DIR', 'browser-profile'));

  const config = {
    appEnv,
    dataRoot,
    baseUrl: readString(env, 'PUBLISH_WORKBENCH_BASE_URL'),
    logLevel: readString(env, 'PUBLISH_WORKBENCH_LOG_LEVEL', 'info'),
    sessionSecret: readString(env, 'PUBLISH_WORKBENCH_SESSION_SECRET'),
    authEmail: {
      enabled: readBoolean(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_ENABLED', false),
      from: readString(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_FROM'),
      smtpHost: readString(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_HOST'),
      smtpPort: readInteger(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_PORT', 587),
      smtpSecure: readBoolean(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_SECURE', false),
      smtpUser: readString(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_USER'),
      smtpPass: readString(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_PASS'),
      allowedRecipients: readRecipients(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS'),
      codeTtlMs: readInteger(env, 'PUBLISH_WORKBENCH_AUTH_EMAIL_CODE_TTL_MS', DEFAULT_AUTH_EMAIL_CODE_TTL_MS)
    },
    web: {
      host: readString(env, 'PUBLISH_WORKBENCH_WEB_HOST', '127.0.0.1'),
      port: readInteger(env, 'PUBLISH_WORKBENCH_WEB_PORT', 4310),
      trustProxy: readBoolean(env, 'PUBLISH_WORKBENCH_WEB_TRUST_PROXY', false)
    },
    worker: {
      workerId: readString(env, 'PUBLISH_WORKBENCH_WORKER_ID', 'worker-local'),
      pollMs: readInteger(env, 'PUBLISH_WORKBENCH_WORKER_POLL_MS', 2_000),
      browserProfileDir,
      browserHeadless: readBoolean(env, 'PUBLISH_WORKBENCH_BROWSER_HEADLESS', true)
    },
    lock: {
      key: 'tistory-browser-lane',
      leaseMs: readInteger(env, 'PUBLISH_WORKBENCH_LOCK_LEASE_MS', DEFAULT_LOCK_LEASE_MS),
      heartbeatMs: readInteger(env, 'PUBLISH_WORKBENCH_LOCK_HEARTBEAT_MS', DEFAULT_LOCK_HEARTBEAT_MS),
      staleThresholdMs: DEFAULT_STALE_THRESHOLD_MS
    },
    retention: {
      stagedSuccessTtlMs: readInteger(env, 'PUBLISH_WORKBENCH_STAGED_SUCCESS_TTL_MS', DEFAULT_STAGED_SUCCESS_TTL_MS),
      stagedFailureTtlMs: readInteger(env, 'PUBLISH_WORKBENCH_STAGED_FAILURE_TTL_MS', DEFAULT_STAGED_FAILURE_TTL_MS),
      qrTtlMs: readInteger(env, 'PUBLISH_WORKBENCH_QR_TTL_MS', DEFAULT_QR_TTL_MS),
      qrSuccessGraceMs: 15 * 60 * 1000,
      qrFailureTtlMs: 30 * 60 * 1000
    },
    qrEmail: {
      enabled: readBoolean(env, 'PUBLISH_WORKBENCH_QR_EMAIL_ENABLED', false),
      from: readString(env, 'PUBLISH_WORKBENCH_QR_EMAIL_FROM'),
      smtpHost: readString(env, 'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_HOST'),
      smtpPort: readInteger(env, 'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_PORT', 587),
      smtpSecure: readBoolean(env, 'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_SECURE', false),
      smtpUser: readString(env, 'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_USER'),
      smtpPass: readString(env, 'PUBLISH_WORKBENCH_QR_EMAIL_SMTP_PASS'),
      allowedRecipients: readRecipients(env, 'PUBLISH_WORKBENCH_QR_EMAIL_ALLOWED_RECIPIENTS')
    }
  };

  if (appEnv === 'production' && !config.baseUrl) {
    throw new Error('PUBLISH_WORKBENCH_BASE_URL is required in production.');
  }

  if (appEnv === 'production' && !config.sessionSecret) {
    throw new Error('PUBLISH_WORKBENCH_SESSION_SECRET is required in production.');
  }
  if (config.authEmail.enabled) {
    if (!config.authEmail.from) {
      throw new Error('PUBLISH_WORKBENCH_AUTH_EMAIL_FROM is required when email auth is enabled.');
    }
    if (!config.authEmail.smtpHost) {
      throw new Error('PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_HOST is required when email auth is enabled.');
    }
    if (config.authEmail.allowedRecipients.length === 0) {
      throw new Error('PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS is required when email auth is enabled.');
    }
    if (config.authEmail.codeTtlMs < 60_000) {
      throw new Error('PUBLISH_WORKBENCH_AUTH_EMAIL_CODE_TTL_MS must be at least 60000.');
    }
  }

  if (config.lock.heartbeatMs > config.lock.leaseMs) {
    throw new Error('PUBLISH_WORKBENCH_LOCK_HEARTBEAT_MS cannot exceed PUBLISH_WORKBENCH_LOCK_LEASE_MS.');
  }

  return config;
}

export function assertWorkerBootstrapContract({ argv = [], env = process.env, mode = 'job-worker' } = {}) {
  const values = argv.map(value => String(value));
  const forbiddenArgs = [];
  const payloadFlags = new Set([
    '--title',
    '--body',
    '--body-file',
    '--description',
    '--tags',
    '--category',
    '--hero-image',
    '--source-url',
    '--source-urls',
    '--qr-email-to',
    '--blog-url'
  ]);

  for (const value of values) {
    if (payloadFlags.has(value)) {
      forbiddenArgs.push(value);
    }
  }

  const forbiddenEnvKeys = PAYLOAD_ENV_KEYS.filter(key => {
    const value = env[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });

  if (forbiddenArgs.length > 0 || forbiddenEnvKeys.length > 0) {
    throw new Error(
      `Worker bootstrap payload must be artifact-backed. Forbidden argv/env detected: ${[
        ...forbiddenArgs,
        ...forbiddenEnvKeys
      ].join(', ')}`
    );
  }

  if (mode === 'queue-worker') {
    const allowedQueueArgs = new Set(['--once']);
    const unexpected = values.filter(value => !allowedQueueArgs.has(value));
    if (unexpected.length > 0) {
      throw new Error(`Queue worker bootstrap must be minimal. Unexpected argv: ${unexpected.join(', ')}`);
    }
    return;
  }

  if (values.length !== 2 || values[0] !== '--job-id' || !values[1]) {
    throw new Error('Job worker bootstrap must be exactly `--job-id <value>`.');
  }
}
